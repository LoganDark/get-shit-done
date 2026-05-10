# Phase 2: Bulk Call-Site Migration (Still Git-Only) - Pattern Map

**Mapped:** 2026-05-09
**Files analyzed:** ~25 source/test/config files modified + 1 file created (`sdk/src/vcs/jj/.gitkeep`) + several gap-fill SDK additions to `sdk/src/vcs/types.ts` and `sdk/src/vcs/backends/git.ts`
**Analogs found:** 25 / 26 (every migration has a Phase-1 in-tree analog; the only "no analog" item is the optional async-init helper described under §No Analog Found)

Every artifact in Phase 2 has a strong in-tree analog from Phase 1's just-landed work. This is fundamentally a copy-the-shape-and-port phase.

---

## File Classification

### Migration targets (call-site swaps; per-file commit per D-05/D-06)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `get-shit-done/bin/lib/worktree-safety.cjs` (MODIFY) | service (worktree policy module) | request-response | `sdk/src/vcs/parse/worktree-list.ts` (read-only porcelain mirror) + `sdk/src/vcs/backends/git.ts:269-280` (`workspace.list` impl) | exact (smoke-test target consumes the same `readWorktreeList`) |
| `get-shit-done/bin/lib/init.cjs` (MODIFY) | controller (CLI command + helpers) | request-response | `sdk/src/vcs/__tests__/baseline-parity.test.ts:92-108` (adapter-level equivalence pattern) + `sdk/src/vcs/backends/git.ts:160-190` (`status` impl) | exact (3 sites already have baselines) |
| `get-shit-done/bin/lib/commands.cjs` (MODIFY) | controller (CLI commands) | CRUD (mostly) | `sdk/src/vcs/backends/git.ts:80-125` (`commit` impl) + `sdk/src/vcs/backends/git.ts:193-204` (`diff` impl) | role-match (gap-fill verbs needed for 8 sites) |
| `get-shit-done/bin/lib/verify.cjs` (MODIFY) | service (verify pipeline) | request-response | `sdk/src/vcs/backends/git.ts:130-151` (`log` impl) + `sdk/src/vcs/backends/git.ts:236-239` (`exists` impl) | role-match (4 gap-fill verbs needed) |
| `get-shit-done/bin/lib/core.cjs` (MODIFY) | utility (shared CJS helpers) | n/a | `sdk/src/vcs/exec.ts:78-118` (the byte-identity reference of `core.cjs::execGit`) | exact (the SDK already mirrors this file's helper line-for-line) |
| `get-shit-done/bin/lib/graphify.cjs` (MODIFY) | service (commit-graph traversal) | transform | `sdk/src/vcs/backends/git.ts:130-151` (`log` impl) | role-match (needs `expr.range` + count primitive) |
| `sdk/src/query/commit.ts` (MODIFY) | service (commit handler) | CRUD | `sdk/src/vcs/exec.ts:113-118` (the byte-equivalent SDK `execGit` import target) | exact (commit.ts:37-48 is byte-identical to vcs/exec.ts:113-118 minus the WR-06 sentinel) |
| `sdk/src/query/init.ts` (MODIFY) | service (init handler) | request-response | `sdk/src/vcs/backends/git.ts:160-190` (`status` impl) | exact (init.ts is a TS port of init.cjs; same migration shape) |
| `sdk/src/query/verify.ts` (MODIFY) | service (verify TS) | request-response | `sdk/src/vcs/backends/git.ts:130-151` (`log` impl) + gap-filled `vcs.refs.exists` | role-match |
| `sdk/src/query/progress.ts` (MODIFY) | service (progress reporter) | request-response | `sdk/src/vcs/backends/git.ts:130-151` (`log` impl) | role-match (3 sites all need gap-fill verbs) |
| `sdk/src/query/check-ship-ready.ts` (MODIFY) | service (ship-ready check) | request-response | `sdk/src/vcs/backends/git.ts:236-239` (`bookmarks.exists` impl) | role-match (5 sites; 3 need gap-fill) |
| `sdk/src/init-runner.ts` (MODIFY) | service (init runner; async) | request-response | `sdk/src/vcs/backends/git.ts:325-345` (`gitOnly.*` shape) | partial (single async site; gap-fill `gitOnly.init()` + flip async→sync) |

### Test-pair migrations (commit alongside source per D-06)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `tests/orphan-worktree-detection.test.cjs`, `tests/prune-orphaned-worktrees.test.cjs`, `tests/bug-2774-worktree-cleanup-workspace-safety.test.cjs`, `tests/bug-3281-worktree-git-timeout.test.cjs` (MODIFY, paired with `worktree-safety.cjs`) | test (CJS) | n/a | `tests/helpers.cjs:201-266` (the `vcsTest` fixture) | exact (consumption pattern already shipped) |
| `tests/verify.test.cjs`, `tests/schema-drift.test.cjs` (MODIFY, paired with `verify.cjs`) | test (CJS) | n/a | `tests/helpers.cjs:201-266` (`vcsTest`) + `sdk/src/vcs/__tests__/git-backend.test.ts:25-39` (initRepo pattern) | exact |
| `tests/commands.test.cjs`, `tests/workspace.test.cjs`, `tests/commit-files-deletion.test.cjs`, `tests/quick-branching.test.cjs`, `tests/bug-2767-gsd-sdk-commit-files-flag.test.cjs`, `tests/bug-2916-handle-branching-default-base.test.cjs` (MODIFY, paired with `commands.cjs`) | test (CJS) | n/a | `tests/helpers.cjs:201-266` (`vcsTest`) | exact |
| `tests/graphify.test.cjs`, `tests/enh-3170-graphify-commit-staleness.test.cjs` (MODIFY, paired with `graphify.cjs`) | test (CJS) | n/a | `tests/helpers.cjs:201-266` (`vcsTest`) | exact |
| `tests/core.test.cjs`, `tests/profile-output.test.cjs`, `tests/bug-2772-gitmodules-path-intersection.test.cjs` (MODIFY, paired with `core.cjs`) | test (CJS) | n/a | `tests/helpers.cjs:201-266` (`vcsTest`) | exact |
| `sdk/src/query/commit.test.ts` (MODIFY, paired with `commit.ts`) | test (vitest) | n/a | `sdk/src/vcs/__tests__/git-backend.test.ts:25-39` (`initRepo`) | exact (gpgsign fix lifted from `git-backend.test.ts:31-32`) |
| `sdk/src/init-e2e.integration.test.ts`, `sdk/src/lifecycle-e2e.integration.test.ts` (MODIFY, paired with `init.ts`) | test (vitest integration) | n/a | `sdk/src/vcs/__tests__/baseline-parity.test.ts:46-58` (`initFixture`) | exact |

### Adapter surface gap-fill (Phase-1-amendment, lands in plan 02-02)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `sdk/src/vcs/types.ts` (MODIFY) | type-definitions | n/a | self (lines 140-180) | exact (extending existing namespaces) |
| `sdk/src/vcs/backends/git.ts` (MODIFY) | service (git backend) | request-response | self (lines 207-345 — bookmarks/workspace/gitOnly closures) | exact (same factory shape, new methods) |
| `sdk/src/vcs/expr.ts` (MODIFY — add `expr.range`) | utility (factories) | transform | self (lines 63-84) | exact (new factory entry alongside existing four) |
| `sdk/src/vcs/parse/git-rev.ts` (MODIFY — handle `range` kind) | utility (translator) | transform | self (lines 9-21 — switch on parsed kind) | exact |
| `sdk/src/vcs/parse/jj-rev.ts` (MODIFY — handle `range` kind, stub for jj) | utility (translator stub) | transform | self (lines 10-22) | exact |
| `sdk/src/vcs/__tests__/git-backend.test.ts` (MODIFY — tests for new verbs) | test (vitest) | n/a | self (lines 75-95 — per-verb test block) | exact |
| `sdk/src/vcs/__tests__/expr.test.ts` (MODIFY — `expr.range` tests) | test (vitest) | n/a | self (existing entries) | exact |
| `sdk/src/vcs/__tests__/adapter-contract.test.ts` (MODIFY — new contract tests for symmetric verbs) | test (parameterized) | n/a | self (lines 13-78) | exact |

### Sidecar + helpers + lint allowlist + baselines

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `sdk/src/vcs/jj/.gitkeep` (NEW) | config (placeholder) | n/a | (no existing `.gitkeep`; closest precedent is the **deleted** `sdk/src/vcs/_placeholder.ts`) | role-match (Phase 1 plan 01-02 created the same kind of zero-conflict surface and then deleted it) |
| `tests/helpers.cjs` (MODIFY — `createTempGitProject` becomes adapter-aware) | test-helper (CJS) | n/a | self (lines 86-104 + 183-197 lazy-loader) | exact |
| `scripts/lint-vcs-no-raw-git.allow.json` (MODIFY — day-one shrink) | config (allowlist data) | n/a | self (initial commit `9c1344e8` "feat(01-05): add lint-vcs-no-raw-git allowlist (D-18)") | exact (shrink mirrors that commit's diff in reverse) |
| `tests/__tools__/capture-vcs-baselines.cjs` (MODIFY — extend `baselines` array per D-10) | tooling (baseline capture) | batch | self (lines 58-89 — entry shape) | exact |
| `tests/baselines/git-vcs/<id>.snap.json` (NEW × ~30 entries) | data (snapshot) | n/a | `tests/baselines/git-vcs/commands-cjs-994-diff-cached.snap.json` | exact (every Phase-2 baseline copies this shape verbatim) |
| `sdk/src/vcs/__tests__/baseline-parity.test.ts` (MODIFY — extend adapter-equivalence dispatch table) | test (parity) | n/a | self (lines 60-114 — args-shape switch) | exact |

---

## Pattern Assignments

### `get-shit-done/bin/lib/worktree-safety.cjs` (service, request-response — smoke-test target)

**Analog:** `sdk/src/vcs/backends/git.ts` lines 269-280 (`workspace.list` impl) + `sdk/src/vcs/parse/worktree-list.ts` (read-only porcelain mirror).

**Why this analog:** The SDK already moved the porcelain reader into the SDK exactly so consumers (including `worktree-safety.cjs` after migration) can stop running `git worktree list --porcelain` themselves. This is the textbook "consume what Phase 1 already built" case.

**Imports / require pattern** (the eager top-of-file CJS require — RESEARCH §Pattern 2):
```javascript
// At top of worktree-safety.cjs, alongside existing requires (line 9 area):
const { createVcsAdapter } = require('@gsd-build/sdk/dist-cjs/vcs');
// If package-name resolution doesn't work from bin/lib (verify at smoke-test commit):
//   require('../../../sdk/dist-cjs/vcs')   // adjust depth
```

**Core pattern — adapter consumption** (mechanical replacement of `worktree-safety.cjs:80`):
```javascript
// BEFORE (worktree-safety.cjs:78-107):
function readWorktreeList(repoRoot, deps = {}) {
  const execGit = deps.execGit || execGitDefault;
  const listResult = execGit(repoRoot, ['worktree', 'list', '--porcelain']);
  // ... timeout/exit/return
}

// AFTER (mechanical-only — D-08):
function readWorktreeList(repoRoot, deps = {}) {
  const vcs = deps.vcs || createVcsAdapter(repoRoot, { kind: 'git' });
  // For the porcelain text path (parseWorktreeEntries downstream), call
  // the SDK parser directly — vcs.workspace.list() returns the parsed
  // structure but loses the raw porcelain. Both paths are exposed.
  const { readWorktreeList: readPorcelain } =
    require('@gsd-build/sdk/dist-cjs/vcs/parse/worktree-list');
  const result = readPorcelain(repoRoot);
  if (!result.ok) return { ok: false, reason: result.reason, porcelain: '', entries: [] };
  return { ok: true, reason: 'ok', porcelain: result.porcelain, entries: result.entries };
}
```

**Lines 122/123/198 (gap-blocked):** These three sites use `--git-dir`, `--git-common-dir`, and `worktree prune` respectively. Per RESEARCH §Forward-Complete Gaps, they require **Plan 02-02 gap-fill** (`vcs.workspace.context()` + `vcs.workspace.prune()`). The smoke-test commit (D-01) migrates ONLY line 80; lines 122/123/198 wait for the gap-fill plan, then migrate in a later same-file commit. Per D-05 atomicity this means worktree-safety.cjs gets ONE post-gap-fill commit that sweeps lines 122/123/198 + the deletion of `execGitDefault` (lines 31-49) together.

**Error handling pattern** — preserve the existing `result.timedOut` / `result.exitCode !== 0` branches verbatim (D-08 mechanical-only). The adapter's 5-field shape is a superset of what `execGitDefault` returned; nothing changes for callers reading `exitCode`/`stdout`/`stderr`.

---

### `get-shit-done/bin/lib/init.cjs` (controller, request-response)

**Analog:** `sdk/src/vcs/backends/git.ts:160-190` (status impl) for the porcelain probes + `sdk/src/vcs/backends/git.ts:325-345` (gitOnly.version) for the `--version` probe.

**Imports pattern** (verbatim from `tests/helpers.cjs:185-197` — but eager not lazy, since `init.cjs` is a CLI entry point):
```javascript
const { createVcsAdapter } = require('@gsd-build/sdk/dist-cjs/vcs');
```

**Core pattern — status site (1519, 1641):**
```javascript
// BEFORE (init.cjs:1519):
const status = execSync('git status --porcelain', { cwd: fullPath, encoding: 'utf8', timeout: 5000 });
hasUncommitted = status.trim().length > 0;

// AFTER (mechanical-only):
const vcs = createVcsAdapter(fullPath, { kind: 'git' });
const status = vcs.status({ porcelain: true });
hasUncommitted = status.entries.length > 0;
// Note: D-08 forbids restructuring the surrounding try/catch (line 1518-1521).
```

**Core pattern — version probe (1538):**
```javascript
// BEFORE (init.cjs:1538):
try {
  execSync('git --version', { encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
  worktreeAvailable = true;
} catch { /* no git at all */ }

// AFTER (uses gitOnly.version per RESEARCH §Pattern 3):
try {
  const vcs = createVcsAdapter(cwd, { kind: 'git' });
  if (vcs.kind === 'git') {  // narrow per Phase 1 D-07
    vcs.gitOnly.version();    // throws on non-zero exit (Phase 1 WR-02)
    worktreeAvailable = true;
  }
} catch { /* no git at all */ }
```

**Baselines (already exist from Phase 1):**
- `init-cjs-1519-status-porcelain.snap.json`
- `init-cjs-1538-version.snap.json` (uses `match.stdout = 'regex:^git version '`)
- `init-cjs-1641-status-porcelain.snap.json`

No new baseline-capture entries needed for init.cjs; the parity test already references these.

---

### `get-shit-done/bin/lib/commands.cjs` (controller, CRUD-heavy)

**Analog:** `sdk/src/vcs/backends/git.ts:80-125` (`commit` impl, including the `add` → `commit` two-step) + `sdk/src/vcs/backends/git.ts:193-204` (`diff` impl).

**This file has 14 sites, 8 of which need gap-fill verbs.** Migration commit MUST land **after** plan 02-02 (gap-fill) per RESEARCH §Forward-Complete Gaps. The mechanical edits then become trivial swaps onto the new verbs.

**Core pattern — `cmdCommit` block (lines 305-355):**

```javascript
// BEFORE (commands.cjs:305-339, structural shape):
const branch = execGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
if (createBranch) execGit(cwd, ['checkout', '-b', branchName]);
else execGit(cwd, ['checkout', branchName]);

if (deletion) execGit(cwd, ['rm', '--cached', '--ignore-unmatch', file]);
else execGit(cwd, ['add', file]);

execGit(cwd, commitArgs);
const shortSha = execGit(cwd, ['rev-parse', '--short', 'HEAD']);

// AFTER (post-gap-fill, mechanical-only — preserves block structure per D-08
// Pitfall 2: do NOT collapse stage+commit into a single vcs.commit call):
const vcs = createVcsAdapter(cwd, { kind: 'git' });
const branch = vcs.refs.currentBranch();                            // gap-fill verb
if (createBranch) vcs.refs.bookmarks.switch(branchName, { create: true }); // gap-fill verb
else vcs.refs.bookmarks.switch(branchName);                         // gap-fill verb

if (deletion) vcs.unstage([file]);                                  // gap-fill verb
else vcs.stage([file]);                                             // gap-fill verb

vcs.commit({ /* preserve original commitArgs shape — message, allowEmpty */ });
const shortSha = vcs.refs.resolveShort(vcs.refs.head);              // gap-fill verb
```

**Diff site (line 994) — already covered:**
```javascript
// BEFORE: execSync('git diff --cached --name-only', …)
// AFTER:  vcs.diff({ staged: true, nameOnly: true }).nameOnly.join('\n')
//         (baseline commands-cjs-994-diff-cached.snap.json already exists)
```

**Anti-pattern reminder (RESEARCH Pitfall 2):** The `if (deletion) … else …` block is two adjacent migrations, not one. Migrate as two adapter calls preserving the if/else, even though `vcs.commit({files})` could in principle do both stage and commit. **D-08 forbids the squash.**

---

### `get-shit-done/bin/lib/verify.cjs` (service, request-response)

**Analog:** `sdk/src/vcs/backends/git.ts:130-151` (`log` impl) + `sdk/src/vcs/backends/git.ts:236-239` (`bookmarks.exists` — closest existing "does X exist?" pattern, the model for the `vcs.refs.exists` gap-fill verb).

**Core pattern — `cat-file -t` existence probe (lines 71, 268, 1305):**
```javascript
// BEFORE: const r = execGit(cwd, ['cat-file', '-t', hash]);
//         const exists = r.exitCode === 0;
// AFTER (post-gap-fill):
const exists = vcs.refs.exists(/* RevisionExpr from hash */);
```

**Core pattern — `log --oneline --all -50` (line 1224):**
```javascript
// BEFORE: execGit(cwd, ['log', '--oneline', '--all', '-50']);
// AFTER (gap-fill extends LogOpts with allRefs):
vcs.log({ format: 'oneline', maxCount: 50, allRefs: true });
```

**Core pattern — `diff --name-status base HEAD` (line 1309):**
```javascript
// BEFORE: execGit(cwd, ['diff', '--name-status', base, 'HEAD']);
// AFTER (gap-fill extends DiffOpts with nameStatus):
vcs.diff({ rev: /* expr.bookmark(base) or similar */, nameStatus: true });
```

---

### `get-shit-done/bin/lib/core.cjs` (utility, n/a)

**Analog:** `sdk/src/vcs/exec.ts:78-118` — verbatim TS port of `core.cjs:742-758` (Phase 1 PATTERNS.md lines 36-69 explicitly call this out as the byte-identity reference).

**Why core.cjs migrates LAST:** `core.cjs::execGit` is **re-exported** to `commands.cjs:7`, `verify.cjs:8`, `graphify.cjs:6`, `worktree-safety.cjs` (via `deps.execGit` injection). RESEARCH §core.cjs migration sequencing locks the order: every other consumer migrates first; core.cjs's commit then deletes the helper export entirely.

**Core pattern — `check-ignore` site (line 603):**
```javascript
// BEFORE: const result = execFileSync('git', ['check-ignore', '-q', '--no-index', '--', targetPath], …);
// AFTER (gap-fill adds vcs.refs.isIgnored):
const isIgnored = vcs.refs.isIgnored(targetPath);
```

**Helper deletion (lines 742-758):** The whole `execGit` function block deletes in the same commit. The deletion satisfies D-08 because every caller has already migrated; nothing surrounding the function changes.

---

### `get-shit-done/bin/lib/graphify.cjs` (service, transform)

**Analog:** `sdk/src/vcs/backends/git.ts:130-151` (`log` impl) + `sdk/src/vcs/expr.ts:63-84` (factory shape — the `expr.range` gap-fill copies this verbatim).

**Core pattern — range expression site (line 384):**
```javascript
// BEFORE: execGit(cwd, ['rev-list', '--count', `${from}..${to}`]);
// AFTER (post-gap-fill, uses expr.range + countCommits):
vcs.refs.countCommits({ rev: expr.range(/* from RevisionExpr */, /* to RevisionExpr */) });
```

**`expr.range` factory** (gap-fill, copies the existing four-factory shape from `expr.ts:63-84`):
```typescript
// New entry in expr.ts factory object:
range(from: RevisionExpr, to: RevisionExpr): RevisionExpr {
  // The encoded form embeds two parsed-encoded substrings, separated by '..'.
  // parse/git-rev.ts emits "<fromGit>..<toGit>".
  // parse/jj-rev.ts emits "<fromJj>..<toJj>" (jj also uses .. for inclusive ranges).
  return brand(`range:${from as unknown as string}..${to as unknown as string}`);
},
```

---

### `sdk/src/query/commit.ts` (service, CRUD)

**Analog:** `sdk/src/vcs/exec.ts:113-118` — the SDK already exports an `execGit` that is **byte-equivalent** to `commit.ts:37-48`'s local helper (verified: both 12-line wrappers around `spawnSync('git', args, ...)`). Phase 1 RESEARCH A11 confirms the only difference is the WR-06 `EXIT_CODE_SIGNAL_KILLED = -1` sentinel vs. `?? 1` collapse, and "Sentinel difference is a known divergence; mechanical replacement is safe."

**Imports pattern** (mechanical replacement of `commit.ts:37-48`):
```typescript
// BEFORE (commit.ts:21):
import { spawnSync } from 'node:child_process';
// ... and lines 37-48 declaring the local execGit helper

// AFTER:
import { execGit } from '../vcs/exec.js';
// (and delete the local execGit definition at lines 37-48)
// Optionally also: import { createVcsAdapter } from '../vcs/index.js';
```

**Core pattern — commit + diff sites (lines 148, 155, 170, 211):**
```typescript
// BEFORE (commit.ts:148-179, structural shape):
execGit(projectDir, ['add', '--', file]);                        // line 148
const staged = execGit(projectDir, ['diff', '--cached', '--name-only', '--', ...pathsToCommit]); // 155
const result = execGit(projectDir, commitArgs);                  // 170
const shortSha = execGit(projectDir, ['rev-parse', '--short', 'HEAD']); // 179

// AFTER (post-gap-fill):
const vcs = createVcsAdapter(projectDir, { kind: 'git' });
vcs.stage([file]);                                               // gap-fill verb
const staged = vcs.diff({ staged: true, nameOnly: true, paths: pathsToCommit });
const result = vcs.commit({ message, files: pathsToCommit /* or undefined */ });
const shortSha = vcs.refs.resolveShort(vcs.refs.head);           // gap-fill verb
```

**Special — `commitToSubrepo` block (lines 294-313):** Uses the `git -C <dir>` invocation form. Per RESEARCH Pitfall 4, the migration moves cwd from arg to `createVcsAdapter(projectDir, …)` factory call. **Capture a baseline using `-C` form first**, assert the adapter (using `cwd:`) produces byte-identical output, and surface any divergence.

---

### `sdk/src/query/init.ts` (service, request-response)

**Analog:** `get-shit-done/bin/lib/init.cjs` migration (above) — `init.ts` is a TS port of `init.cjs` per its own header comment. Migrations are byte-symmetric. Land both in the same plan or adjacent plans per D-02 (small files first).

Sites at 1009, 1019, 1138 mirror init.cjs:1519, 1538, 1641 exactly (status, version, status). New baselines `init-ts-1009-status-porcelain.snap.json`, `init-ts-1019-version.snap.json`, `init-ts-1138-status-porcelain.snap.json` per D-10 (every site gets its own).

---

### `sdk/src/query/verify.ts` (service, request-response)

**Analog:** `verify.cjs` migration (above) for `cat-file -t` and `log --all` patterns + `sdk/src/vcs/__tests__/baseline-parity.test.ts:46-58` for the test fixture pattern.

Sites at 336, 485, 628 are pure ports of equivalent `verify.cjs` patterns. After gap-fill, mechanical swaps onto `vcs.refs.exists(...)` and `vcs.log({allRefs: true, ...})`.

---

### `sdk/src/query/progress.ts` (service, request-response)

**Analog:** `sdk/src/vcs/backends/git.ts:130-151` (`log` impl, returns `LogEntry[]` with `date` field).

**Core pattern — `show -s --format=%as <commit>` (line 293):**
```typescript
// BEFORE: execGit(projectDir, ['show', '-s', '--format=%as', firstCommit]);
// AFTER:  vcs.log({ rev: /* expr from firstCommit */, maxCount: 1 })[0]?.date
```

Sites 286 (`rev-list --count`) and 290 (`rev-list --max-parents=0`) need gap-fill verbs `vcs.refs.countCommits` and `vcs.refs.rootCommits`.

---

### `sdk/src/query/check-ship-ready.ts` (service, request-response)

**Analog:** `sdk/src/vcs/backends/git.ts:236-239` (`bookmarks.exists` — for the `git rev-parse --verify main` site at line 55) + gap-fill verbs for the rest.

**Core pattern — verify-ref site (line 55):**
```typescript
// BEFORE: boolSyncSafe('git rev-parse --verify main', projectDir);
// AFTER:  vcs.refs.bookmarks.exists('main');   // already in Phase 1 contract; no gap.
```

5 sites total; 3 need gap-fill (`currentBranch`, `configGet`, `remotes`).

---

### `sdk/src/init-runner.ts` (service, async)

**Analog:** `sdk/src/vcs/backends/git.ts:325-345` (`gitOnly.*` namespace shape — model for `gitOnly.init()` gap-fill).

**Core pattern — `git init` site (line 139):**

Per RESEARCH §sdk/src/init-runner.ts, the sync-only adapter doesn't fit the existing async helper. Recommendation: flip line 139 from `await this.execGit(['init'])` to a sync `vcs.gitOnly.init()` (gap-fill verb). Single-shot init has no concurrency benefit; the flip is mechanical.

```typescript
// BEFORE (init-runner.ts:139):
await this.execGit(['init']);

// AFTER:
const vcs = createVcsAdapter(this.projectDir, { kind: 'git' });
if (vcs.kind === 'git') vcs.gitOnly.init();   // gap-fill verb
```

---

### `tests/helpers.cjs::createTempGitProject` (test-helper, MODIFY)

**Analog:** Self — the existing function at `tests/helpers.cjs:86-104` is the pre-image; the lazy-loader pattern at `tests/helpers.cjs:183-197` (`_loadVcs`) is the consumption shape.

**Core pattern — Option B from RESEARCH §Helpers Migration (recommended):**
```javascript
// AFTER (mechanical, preserving the function signature so all 14 callers work unchanged):
function createTempGitProject(prefix = 'gsd-test-') {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), prefix));
  fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'), { recursive: true });

  const { createVcsAdapter } = _loadVcs().vcs;
  const vcs = createVcsAdapter(tmpDir, { kind: 'git' });
  if (vcs.kind === 'git') vcs.gitOnly.init();   // gap-fill verb (RESEARCH A9: works on non-repo cwd)
  // Re-create adapter post-init so .git is found:
  const repo = createVcsAdapter(tmpDir, { kind: 'git' });
  // Config setup — gpgsign disablers — needs vcs.gitOnly.configSet() OR stays
  // raw under helpers.cjs's existing allowlist exception. RESEARCH recommends
  // staying raw here since helpers.cjs is in the allowlist as a legitimate
  // bootstrap path; see §Day-One Allowlist Shrink "tests/helpers.cjs" entry.
  execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config commit.gpgsign false', { cwd: tmpDir, stdio: 'pipe' });

  fs.writeFileSync(path.join(tmpDir, '.planning', 'PROJECT.md'), '# Project\n\nTest project.\n');
  repo.commit({ files: ['.'], message: 'initial commit' });   // adapter call
  return tmpDir;
}
```

(Planner may instead route configs through a new `vcs.gitOnly.configSet(key, value)` gap-fill verb — RESEARCH §Helpers Migration leaves this open. The minimum-shrink path keeps the configs raw inside the allowlisted file.)

---

### `tests/__tools__/capture-vcs-baselines.cjs` (tooling, batch — MODIFY for D-10)

**Analog:** Self — the existing `baselines` array at lines 58-89 sets the entry shape. Each new Phase-2 baseline appends an entry of the same shape:

```javascript
{
  id: 'worktree-safety-cjs-80-list-porcelain',
  source: 'get-shit-done/bin/lib/worktree-safety.cjs:80',
  fixture: ['git worktree add /tmp/wt-test'],   // shell-style setup
  args: ['worktree', 'list', '--porcelain'],
},
```

Run `node tests/__tools__/capture-vcs-baselines.cjs` after appending entries; the script writes `tests/baselines/git-vcs/<id>.snap.json`. Format reference: `tests/baselines/git-vcs/commands-cjs-994-diff-cached.snap.json` (verbatim shape — `id`, `source`, `captured_at`, `fixture`, `command`, `args`, `expected: {exitCode, stdout, stderr, timedOut, error}`, `match: {stdout: 'exact' | 'regex:...'}`).

---

### `sdk/src/vcs/__tests__/baseline-parity.test.ts` (test, parity — MODIFY)

**Analog:** Self — lines 95-108 contain the dispatch table that maps `args` shape → adapter call. Each new gap-fill verb / new call-site pattern adds a clause to that switch:

```typescript
// Existing dispatch (baseline-parity.test.ts:95-108):
if (args[0] === 'diff' && args.includes('--cached') && args.includes('--name-only')) {
  const d = vcs.diff({ staged: true, nameOnly: true });
  expect(d.nameOnly.join('\n')).toBe(baseline.expected.stdout);
} else if (args[0] === 'status' && args.includes('--porcelain')) {
  const s = vcs.status({ porcelain: true });
  expect(s.raw).toBe(baseline.expected.stdout);
} else if (args[0] === '--version') {
  const v = vcs.gitOnly.version();
  expect(v).toMatch(/^git version /);
}
// PHASE 2 ADDITIONS — one clause per new verb:
//   else if (args[0] === 'rev-parse' && args.includes('--abbrev-ref')) { vcs.refs.currentBranch() … }
//   else if (args[0] === 'cat-file' && args[1] === '-t') { vcs.refs.exists(…) … }
//   ... etc
```

---

### `sdk/src/vcs/jj/.gitkeep` (NEW — sidecar surface, D-15/UPSTREAM-02)

**Analog:** Phase 1's `sdk/src/vcs/_placeholder.ts` (created in plan 01-01, deleted in plan 01-02 once real adapter modules landed). RESEARCH §Pattern 4 documents this precedent.

**Recommended file content** (RESEARCH lines 749-755):
```
# UPSTREAM-02 (Phase 2 D-15): zero-conflict sidecar surface.
# Phase 3 populates with sdk/src/vcs/jj/jj.ts (the jj backend).
# Delete this file when the first real .ts module lands here.
```

---

### `scripts/lint-vcs-no-raw-git.allow.json` (config, MODIFY — day-one shrink)

**Analog:** Commit `9c1344e8` "feat(01-05): add lint-vcs-no-raw-git allowlist (D-18)" — the initial-population diff. The day-one shrink mirrors that diff in reverse: every entry that commit added under "migration backlog" gets removed in plan 02-02 task 1.

**Concrete diff (RESEARCH §Day-One Allowlist Shrink):**

Remove from `globs` array:
- `"get-shit-done/bin/lib/**/*.cjs"`
- `"sdk/src/query/commit.ts"`
- `"sdk/src/query/init.ts"`
- `"sdk/src/query/verify.ts"`
- `"sdk/src/query/progress.ts"`
- `"sdk/src/query/check-ship-ready.ts"`
- `"sdk/src/query/check-decision-coverage.ts"`
- `"sdk/src/query/docs-init.ts"`
- `"sdk/src/init-runner.ts"`

Total: 9 entries removed in a single commit at the start of plan 02-02. After the shrink, the allowlist matches its post-Phase-2 steady state per D-14.

---

### Test files migrating to `vcsTest` (D-06 paired commits)

**Analog:** `tests/helpers.cjs:201-266` (the `vcsTest` function) — the consumption pattern.

**Core pattern — replace bespoke beforeEach with vcsTest block:**
```javascript
// BEFORE (typical tests/<x>.test.cjs shape — bespoke fixture):
const { test, before, after, beforeEach } = require('node:test');
let tmpDir;
beforeEach(() => {
  tmpDir = createTempGitProject();
});
afterEach(() => cleanup(tmpDir));
test('something', () => { /* uses tmpDir directly */ });

// AFTER (mechanical retarget onto vcsTest):
const { vcsTest } = require('./helpers.cjs');
vcsTest('git', (handle) => {
  const { test } = require('node:test');
  test('something', () => {
    const cwd = handle.getCwd();
    const vcs = handle.getVcs();
    /* test body — adapter calls instead of execSync */
  });
});
```

**SDK-side analog (`sdk/src/vcs/__tests__/git-backend.test.ts:25-39`):**
- `initRepo(dir)` is the canonical "init + author config + gpgsign disabled + initial empty commit" sequence
- Lines 31-32 (`commit.gpgsign false` + `tag.gpgsign false`) are the exact two lines that plan 02-01 adds to `sdk/src/query/commit.test.ts:23-25` to fix the `:304` failure

---

### `sdk/src/query/commit.test.ts` triage fix (plan 02-01)

**Analog:** `sdk/src/vcs/__tests__/git-backend.test.ts:25-34` — the `initRepo` function shows the correct `beforeEach` shape with both gpgsign disablers.

**Mechanical fix** (RESEARCH §commit.test.ts:304 Triage):
```typescript
// In commit.test.ts beforeEach (around line 23-25):
execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
execSync('git config user.name "Test User"', { cwd: tmpDir, stdio: 'pipe' });
// ADD these two lines (copied from git-backend.test.ts:31-32):
execSync('git config commit.gpgsign false', { cwd: tmpDir, stdio: 'pipe' });
execSync('git config tag.gpgsign false', { cwd: tmpDir, stdio: 'pipe' });
```

---

## Shared Patterns

### Pattern: Eager top-of-file CJS require for adapter consumption

**Source:** RESEARCH §Pattern 2 (verified shape from `tests/helpers.cjs:188`).
**Apply to:** Every `bin/lib/*.cjs` migration (all 6 hotspot files).

```javascript
const { createVcsAdapter, expr } = require('@gsd-build/sdk/dist-cjs/vcs');
```

The smoke-test commit (D-01, plan 02-03) is the canonical proof that this require shape resolves from `bin/lib/*.cjs`. Open Question 2 in RESEARCH flags the relative-path fallback if package-name resolution fails: `require('../../../sdk/dist-cjs/vcs')` (depth from `bin/lib/`).

### Pattern: gitOnly narrowing before backend-specific calls

**Source:** RESEARCH §Pattern 3 + Phase 1 D-07 (verified at `sdk/src/vcs/types.ts:172-180` — `gitOnly` only typed-present on the git branch of the union).
**Apply to:** `init.cjs:1538`, `init.ts:1019` (version probes), `init-runner.ts:139` (gap-filled `gitOnly.init`), `tests/helpers.cjs::createTempGitProject` (gap-filled `gitOnly.init`).

```javascript
const vcs = createVcsAdapter(cwd, { kind: 'git' });
if (vcs.kind === 'git') {
  vcs.gitOnly.version();   // or .init(), .configGet(), .createAnnotatedTag(), …
}
```

Unnarrowed `vcs.gitOnly.x()` is a **TS compile-time error** (Phase 1 D-07). The narrow IS the contract — do not stub `gitOnly` on the JjVcsAdapter "for symmetry" (RESEARCH §Anti-Patterns).

### Pattern: Per-call-site baseline + parity assertion

**Source:** RESEARCH §Pattern 1 (D-10) + `tests/__tools__/capture-vcs-baselines.cjs:58-89` (entry shape) + `tests/baselines/git-vcs/commands-cjs-994-diff-cached.snap.json` (snapshot shape) + `sdk/src/vcs/__tests__/baseline-parity.test.ts:60-114` (parity test).
**Apply to:** Every `execSync('git …')` site that gets migrated (per D-10 — no representative-sampling, no shared baselines across sites).

Three coordinated edits per call site:
1. Append entry to `tests/__tools__/capture-vcs-baselines.cjs::baselines` array.
2. Run `node tests/__tools__/capture-vcs-baselines.cjs` to write the snapshot JSON.
3. Add a clause to `baseline-parity.test.ts` dispatch table mapping `args` → adapter call.

The baseline file's `match.stdout` is `'exact'` by default; for non-deterministic outputs (e.g., `git --version`), use `'regex:^git version '` per the existing init-cjs-1538 entry.

### Pattern: Per-file commit + paired-test atomic commit

**Source:** Commit `aeb7d471` "fix(01): CR-02 status({porcelain:true}) handles paths with whitespace" — the canonical Phase-1 example of source + paired test in one commit (touched `sdk/src/vcs/backends/git.ts` + `sdk/src/vcs/__tests__/git-backend.test.ts` together, no other files).
**Apply to:** Every per-file migration commit (D-05/D-06).

**Commit message shape** (per RESEARCH §Pattern 1, mirrors the existing `refactor(<scope>): …` cadence in the recent log):
```
refactor(<file>): migrate to VcsAdapter

- <verb>: <call sites swapped>
- Test suite (<paired test files>) retargeted to vcsTest

Baselines added:
  - <id-1>.snap.json
  - <id-2>.snap.json

Mechanical edits only (D-08): no logic changes, no rename, no
opportunistic dedup of adjacent invocations.
```

### Pattern: Hotspot-audit grep at verify time

**Source:** RESEARCH §Hotspot Audit Mechanics (D-16, UPSTREAM-03).
**Apply to:** Phase 2 verify pass (NOT a free-standing plan).

Per-hotspot-file `git diff main..phase/02-migration -- <file>` filtered by the allow-list of mechanical shapes (vcs./expr./createVcsAdapter/removed execGit-or-spawnSync/comments/whitespace). Any line that surfaces is reviewed by the verify-pass agent for D-08 violation.

### Pattern: Mechanical-only invariant

**Source:** D-08 (CONTEXT decisions) + RESEARCH §Anti-Patterns + Phase 1 RESEARCH/PATTERNS reinforcement.
**Apply to:** EVERY commit in Phase 2 (load-bearing).

- No variable renames "to match adapter naming."
- No squashing two adjacent execSync calls into one adapter call.
- No opportunistic refactors.
- No expanded comments > 3 lines on migration commits.
- Each `execSync('git ...')` is an atomic migration unit.

The hotspot audit grep (above) is the enforcement mechanism.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `sdk/src/init-runner.ts:139` async→sync flip | service (async port) | request-response | The Phase 1 adapter is sync-only; no existing site demonstrates async→sync conversion of an `await`ed git invocation. The recommendation (flip to sync via `vcs.gitOnly.init()`) is structural; mechanically the change is single-line, but the surrounding control flow (call-site at `init-runner.ts:139` is `await`-shaped) requires inspection during plan time. RESEARCH §sdk/src/init-runner.ts notes this is the ONE structural Phase-1 contract gap. |

(All other Phase 2 modifications have at least a role-match analog. The 17 forward-complete adapter gaps are not "no analog" — they have shape-match analogs in the existing namespaces, e.g., `vcs.refs.bookmarks.exists` is the model for `vcs.refs.exists`, `vcs.refs.head` is the model for `vcs.refs.resolveShort`.)

---

## Metadata

**Analog search scope:**
- `sdk/src/vcs/**` (Phase 1 adapter — 21 files)
- `sdk/src/query/**` (5 migration target files in TS)
- `get-shit-done/bin/lib/**/*.cjs` (6 migration target files + drift.cjs ruled out)
- `tests/helpers.cjs`, `tests/__tools__/capture-vcs-baselines.cjs`, `tests/baselines/git-vcs/**` (test infra)
- `tests/**/*.test.cjs` (14 callers of `createTempGitProject` + 49 tests-with-raw-git per RESEARCH)
- `scripts/lint-vcs-no-raw-git.{cjs,allow.json}` (lint surface)
- Recent git history (40 commits) — verified per-file commit cadence and paired-source/test commit shape

**Files scanned:** ~70 unique files (read in full or in targeted ranges via offset/limit; no re-reads).

**Pattern extraction date:** 2026-05-09

**Key load-bearing observations for the planner:**
1. **Every Phase 2 modification has an in-tree analog.** Phase 1 deliberately landed the adapter shape, the baseline harness, the `vcsTest` fixture, the lint allowlist, and the mechanical-edits invariant — all of which Phase 2 consumes verbatim. No external research, no external libraries.
2. **17 forward-complete gaps must land in plan 02-02 before any per-file migration past the smoke-test.** The existing Phase 1 surface is NOT forward-complete despite the D-04 claim; RESEARCH proves this with line-precise call-site evidence. The gap-fill verbs all have shape-match analogs in the Phase 1 surface (extending namespaces, not designing new ones).
3. **Commit `aeb7d471` is the canonical paired-source/test atomic-commit shape** for the entire Phase 2 migration cadence — mirror its exact form per D-05/D-06.
4. **Commit `9c1344e8` is the inverse of plan 02-02's day-one allowlist shrink** — the diff to remove 9 entries is the algebraic inverse of the lines that commit added.
5. **The smoke-test commit (D-01, plan 02-03) targets `worktree-safety.cjs:80` only** — RESEARCH explicitly disqualifies the other three sites (122, 123, 198) because they expose forward-complete gaps. Pattern 4 above shows the exact mechanical edit, which consumes Phase 1's already-shipped `sdk/src/vcs/parse/worktree-list.ts::readWorktreeList`.
