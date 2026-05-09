---
phase: 01-adapter-foundation-git-backend
plan: 03
subsystem: vcs-git-backend
tags: [vcs, git, backend, byte-identity, baselines, frozen-factory, snapshot-restore, cjs-interop]
dependency_graph:
  requires:
    - "Plan 01-01 — sdk/dist-cjs build pipeline"
    - "Plan 01-02 — VcsAdapter contract surface (types, exec, expr, parse/git-rev, hook-bridge, backends, frozen stub factory)"
  provides:
    - "Real createGitAdapter(cwd): GitVcsAdapter — full implementation against execGit + worktree-safety.cjs DI"
    - "vcs.commit/log/status/diff/refs/refs.bookmarks/workspace/hooks/findConflicts/push/fetch/gitOnly all wired against execGit"
    - "vcs.workspace.list delegates to worktree-safety.cjs::readWorktreeList (RESEARCH Pitfall 5; ADR-0004 policy seam)"
    - "__vcsTestOnly snapshot/restore via strategy 3 (update-ref refs/gsd/test-snapshot HEAD; restore via reset --hard + clean -fdx)"
    - "5 byte-identity baselines under tests/baselines/git-vcs/ — covers commands.cjs:994, init.cjs:1519/1538/1641, commit.ts:211 (B-1 / GIT-02 SC-2)"
    - "baseline-parity.test.ts asserts execGit + adapter verb equivalence to each captured baseline"
    - "tests/vcs-cjs-smoke.test.cjs — plain `node --test` proves SC-1 ('consumable from bin/lib/*.cjs via plain require()') end-to-end (W-1 fix)"
    - "tests/__tools__/capture-vcs-baselines.cjs — Phase-2 regenerator helper (kept; planner-discretion)"
    - "Public worktree-safety.cjs::readWorktreeList export — promoted from internal helper to module surface so the VCS adapter can DI it (ADR-0004 alignment)"
  affects:
    - "Plan 01-04 (parameterized contract suite + lint allowlist) — backends/git.ts is the lint allowlist's first entry; the parameterized suite walks the same surface this plan tests one-verb-per-method"
    - "Plan 01-05 (hookless verify gate) — vcs.findConflicts({scope:'all'}) returns [] today; Phase 3 jj backend implements the real semantics"
    - "Phase 2 (call-site migration) — every inline execSync('git …') call site in bin/lib/*.cjs and sdk/src/query/*.ts now has an adapter equivalent to migrate to; baseline corpus catches drift"
tech_stack:
  added: []
  patterns:
    - "Dual-build module-specifier resolution (eval-guarded `__filename` in CJS, eval-guarded `import.meta.url` in ESM, both filtered for absolute-path-looking values to handle `node -e` evaluation)"
    - "Worktree-safety policy seam consumption via DI (readWorktreeList(cwd, { execGit })) — adapter does NOT duplicate the porcelain parser per ADR-0004"
    - "Frozen-object factory with deep freeze across nested namespaces (refs, refs.bookmarks, workspace, hooks, gitOnly, [__vcsTestOnly])"
    - "Byte-identity baseline corpus — JSON snapshots of {exitCode, stdout, stderr, timedOut, error} for canonical pre-migration call sites; regex-mode opt-in for non-deterministic stdout (e.g. `git --version`)"
    - "RESEARCH Pattern 3 / strategy 3 snapshot-restore — `git update-ref refs/gsd/test-snapshot HEAD` + `git reset --hard <id>` + `git clean -fdx`; symbol-gated (D-14) so production code can't reach it via the public union type"
key_files:
  created:
    - sdk/src/vcs/backends/git.ts
    - sdk/src/vcs/__tests__/git-backend.test.ts
    - sdk/src/vcs/__tests__/baseline-parity.test.ts
    - tests/baselines/git-vcs/.gitkeep
    - tests/baselines/git-vcs/commands-cjs-994-diff-cached.snap.json
    - tests/baselines/git-vcs/commit-ts-execGit-3field.snap.json
    - tests/baselines/git-vcs/init-cjs-1519-status-porcelain.snap.json
    - tests/baselines/git-vcs/init-cjs-1538-version.snap.json
    - tests/baselines/git-vcs/init-cjs-1641-status-porcelain.snap.json
    - tests/vcs-cjs-smoke.test.cjs
    - tests/__tools__/capture-vcs-baselines.cjs
  modified:
    - sdk/src/vcs/index.ts
    - sdk/src/vcs/__tests__/index.test.ts
    - get-shit-done/bin/lib/worktree-safety.cjs
  deleted: []
decisions:
  - "Plan 01-03: dual-build module specifier resolution uses eval-guarded `__filename`/`import.meta.url` and filters for absolute-path-looking values — `node -e '…'` sets __filename to '[eval]' which createRequire rejects, so we fall through to a path-of-last-resort that anchors at process.cwd(). This keeps a single source file dual-buildable across NodeNext (ESM dist) and commonjs (dist-cjs) without TS1343 errors."
  - "Plan 01-03: vcs.findConflicts({scope:'all'}) returns [] on git — RESEARCH Open Q1 documents this asymmetry with jj's first-class `conflict()` revset. Phase 3 jj backend implements the real semantics; the verify gate (CONFLICT-03) consumes 'all' scope and exercises jj-side logic in Phase 3."
  - "Plan 01-03: vcs.refs.bookmarks.list() returns Bookmark[] with rev='' (RESEARCH Open Q2) — Phase 1 promotes to per-item `git rev-parse <name>` only when a caller demands resolved revs. Avoids N+1 git invocations for a list operation no current caller needs the rev for."
  - "Plan 01-03: snapshot/restore uses strategy 3 (refs/gsd/test-snapshot + reset --hard + clean -fdx) over strategy 1 (stash) and strategy 2 (cherry-pick). Strategy 3 is the only one that pins HEAD without touching the index/working-tree intermediate state, which matters for the test harness restoring fixtures across vitest's parallel test modules."
  - "Plan 01-03: capture-vcs-baselines.cjs moved to tests/__tools__/ (rather than deleted) — Phase 2 will expand the baseline corpus as it migrates each call site, and a regenerator helper has long-term value (planner-discretion per Task 3 action step)."
  - "Plan 01-03 [Rule 3]: get-shit-done/bin/lib/worktree-safety.cjs now exports readWorktreeList — it was internal (only consumed by sibling helpers in the same file), but ADR-0004 names this module the canonical owner of worktree porcelain parsing. The VCS adapter's DI consumption (RESEARCH Pitfall 5) requires the function be on the module surface."
metrics:
  duration: "~12m"
  completed: "2026-05-09"
  task_count: 3
  file_count: 14
---

# Phase 01 Plan 03: Git Backend Implementation — Summary

Replaced plan 02's frozen `createGitAdapterStub` with a real `createGitAdapter(cwd): GitVcsAdapter` (404 LOC) that implements every method on the VcsAdapter contract against `execGit` + `worktree-safety.cjs` DI; captured 5 byte-identity baselines under `tests/baselines/git-vcs/` covering the canonical pre-migration `execSync('git …')` call sites named in RESEARCH (B-1 / GIT-02 SC-2); landed `baseline-parity.test.ts` (5 tests) and `tests/vcs-cjs-smoke.test.cjs` (2 Node-test runs) to lock byte-identity and end-to-end CJS consumability respectively.

## Tasks Completed

| Task | Name                                                                                    | Commit     |
| ---- | --------------------------------------------------------------------------------------- | ---------- |
| 1    | Implement sdk/src/vcs/backends/git.ts (full GitVcsAdapter) + 16 tdd happy-path tests    | `61fd5dc5` |
| 2    | Wire createGitAdapter into createVcsAdapter; scaffold tests/baselines/git-vcs/          | `75385751` |
| 3    | Capture 5 byte-identity baselines + baseline-parity test + CJS smoke test               | `b94a492d` |

(RED-phase test commit: `1d8c42de`.)

## File Tree (this plan)

```
sdk/src/vcs/
├── backends/
│   └── git.ts                          (404 lines) — full GitVcsAdapter implementation
├── index.ts                            (modified — stub deleted, real createGitAdapter wired)
└── __tests__/
    ├── git-backend.test.ts             (263 lines, 16 tests) — happy-path coverage per verb
    ├── baseline-parity.test.ts         (112 lines, 5 tests)  — byte-identity vs captured baselines
    └── index.test.ts                   (modified — stub-throws assertion replaced with real-backend assertion)

tests/
├── baselines/git-vcs/
│   ├── .gitkeep
│   ├── commands-cjs-994-diff-cached.snap.json
│   ├── init-cjs-1519-status-porcelain.snap.json
│   ├── init-cjs-1538-version.snap.json
│   ├── init-cjs-1641-status-porcelain.snap.json
│   └── commit-ts-execGit-3field.snap.json
├── vcs-cjs-smoke.test.cjs              (44 lines, 2 tests) — plain require() of dist-cjs
└── __tools__/
    └── capture-vcs-baselines.cjs       (regenerator helper — Phase 2 may expand the corpus)

get-shit-done/bin/lib/
└── worktree-safety.cjs                 (modified — readWorktreeList now exported)
```

Total: 1 new production file (404 lines), 2 new vitest specs (375 lines, 21 tests), 1 new node:test spec (44 lines, 2 tests), 6 new baseline JSON files, 1 regenerator helper, 3 modified files.

## Verification Results

```text
$ pnpm -F sdk build:cjs
$ tsc -p tsconfig.cjs.json && node -e "require('node:fs').writeFileSync('dist-cjs/package.json', …)"
exit 0

$ pnpm -F sdk exec vitest run --project unit src/vcs/__tests__/
✓ src/vcs/__tests__/backends.test.ts          (8 tests)
✓ src/vcs/__tests__/expr.test.ts              (6 tests)
✓ src/vcs/__tests__/parse-git-rev.test.ts     (8 tests)
✓ src/vcs/__tests__/exec.test.ts              (5 tests)
✓ src/vcs/__tests__/index.test.ts             (5 tests)
✓ src/vcs/__tests__/baseline-parity.test.ts   (5 tests)
✓ src/vcs/__tests__/git-backend.test.ts       (16 tests)
Test Files  7 passed (7)
     Tests  53 passed (53)

$ node --test tests/vcs-cjs-smoke.test.cjs
✔ plain require() of dist-cjs/vcs/index.js loads createVcsAdapter
✔ createVcsAdapter against a real tmp git repo returns a git adapter
ℹ pass 2 / fail 0
```

## Confirmation: worktree-safety.cjs Consumed (Not Duplicated)

`vcs.workspace.list()` body (sdk/src/vcs/backends/git.ts:294-303):

```typescript
list: (): WorkspaceInfo[] => {
  // Pitfall 5: delegate to worktree-safety.cjs (ADR-0004 policy seam) — do NOT duplicate.
  if (!worktreeSafety || typeof worktreeSafety.readWorktreeList !== 'function') {
    throw new Error(`worktree-safety.cjs unreachable… <recovery instructions>`);
  }
  const result = worktreeSafety.readWorktreeList(cwd, { execGit });
  if (!result.ok) return [];
  return result.entries.map((e: any): WorkspaceInfo => ({ … }));
},
```

There is NO porcelain-parsing logic in `backends/git.ts` — every parsed worktree entry routes through `worktree-safety.cjs::parseWorktreeEntries` via `readWorktreeList`. The DI hook (`{ execGit }`) lets future migrations route worktree-safety's internal git calls through the adapter without changing the consumer site.

## Verb Coverage (Plan 04 Hand-off)

The parameterized contract suite that plan 04 builds will exercise the following adapter methods. All are implemented and have happy-path coverage in `git-backend.test.ts`:

| Verb                                | Implementation                              | git-backend.test.ts | Plan-04 ready |
| ----------------------------------- | ------------------------------------------- | ------------------- | ------------- |
| `vcs.commit({files,message})`       | `git add … && git commit -m … && rev-parse` | ✓                   | ✓             |
| `vcs.commit({message})` (no files)  | `git commit -am …`                          | ✓                   | ✓             |
| `vcs.log({maxCount,rev,paths})`     | `git log --format=%H%x09%P%x09…`            | ✓                   | ✓             |
| `vcs.status({porcelain})`           | `git status --porcelain` + entry parser     | ✓                   | ✓             |
| `vcs.diff({staged,nameOnly,rev})`   | `git diff [--cached] [--name-only] [<rev>]` | ✓                   | ✓             |
| `vcs.refs.head` / `vcs.refs.parent` | `expr.head()` / `expr.parent()`             | ✓                   | ✓             |
| `vcs.refs.bookmarks.list`           | `git branch --format=%(refname:short)`      | ✓                   | ✓             |
| `vcs.refs.bookmarks.create/move`    | `git branch [<-f>] <name> <rev>`            | ✓                   | ✓             |
| `vcs.refs.bookmarks.delete`         | `git branch -D <name>`                      | ✓                   | ✓             |
| `vcs.refs.bookmarks.exists`         | `git rev-parse --verify --quiet <name>`     | ✓                   | ✓             |
| `vcs.workspace.add`                 | `git worktree add <path> [<rev>]`           | ✓                   | ✓             |
| `vcs.workspace.forget`              | `git worktree remove <path>`                | ✓                   | ✓             |
| `vcs.workspace.list`                | `worktree-safety.cjs::readWorktreeList` DI  | ✓                   | ✓             |
| `vcs.hooks.fire(stage,ctx)`         | `fireHook` from hook-bridge.ts              | ✓                   | ✓             |
| `vcs.findConflicts({scope:'wc'})`   | `git diff --check` parser                   | ✓                   | ✓             |
| `vcs.findConflicts({scope:'all'})`  | returns `[]` (Phase 3 jj impl)              | ✓                   | (asymmetric)  |
| `vcs.push({remote,ref,force})`      | `git push [--force] [<remote>] [<ref>]`     | ✓                   | ✓             |
| `vcs.fetch({remote,ref})`           | `git fetch [<remote>] [<ref>]`              | (no test — trivial) | ✓             |
| `vcs.gitOnly.createAnnotatedTag`    | `git tag -a <name> -m <msg> <rev>`          | ✓                   | git-only      |
| `vcs.gitOnly.version`               | `git --version`                             | ✓                   | git-only      |
| `vcs[__vcsTestOnly].snapshot`       | `git update-ref refs/gsd/test-snapshot …`   | ✓                   | symbol-gated  |
| `vcs[__vcsTestOnly].restore`        | `git reset --hard <id> && git clean -fdx`   | ✓                   | symbol-gated  |

## Plan-05 Lint Allowlist

`sdk/src/vcs/backends/git.ts` MUST be on plan 05's lint allowlist. It intentionally calls `execGit('git', …)` 30+ times — this is the canonical place where direct git invocation is permitted. Every non-allowlisted file in `sdk/src/` and `get-shit-done/bin/lib/` should be rejected by the lint guard for raw `git <subcommand>` shell strings or `execSync('git …')` invocations.

The allowlist for plan 05 should at minimum include:
- `sdk/src/vcs/backends/git.ts` (this plan's primary artifact)
- `sdk/src/vcs/exec.ts` (already lands in plan 02 — the spawn primitive)
- `get-shit-done/bin/lib/worktree-safety.cjs` (ADR-0004 policy seam — its own `execGitDefault` is internal)
- `tests/__tools__/capture-vcs-baselines.cjs` (regenerator — captures pre-migration baselines, must call git directly)
- Vitest test files that need to set up tmp git repos via `execSync('git …')` — these run pre-adapter to seed fixtures, OR we can centralize fixture setup in a tests/helpers and only allowlist that one file. Plan-05's discretion.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] worktree-safety.cjs::readWorktreeList was internal, not exported**

- **Found during:** Task 1 verify (workspace.list test logged `[skip] worktree-safety.cjs unreachable in test env` because the require'd module had no `readWorktreeList` key)
- **Issue:** Plan's `<must_haves>` says "vcs.workspace.list() consumes worktree-safety.cjs::readWorktreeList via dependency injection — does NOT duplicate the porcelain parser (RESEARCH Pitfall 5)". But `readWorktreeList` was a free-standing function in worktree-safety.cjs that was NEVER added to `module.exports = { … }`. Sibling helpers (`listLinkedWorktreePaths`, `snapshotWorktreeInventory`) consumed it via lexical scope; outside the module it was unreachable.
- **Fix:** Added `readWorktreeList` to the module's `module.exports` block with a deviation comment pointing back to ADR-0004 (the policy-seam owner role) and Plan 01-03 (the consumer-introducing plan).
- **Files modified:** `get-shit-done/bin/lib/worktree-safety.cjs` (1 line + 4-line comment block).
- **Why this is Rule 3, not Rule 4:** No architectural change. ADR-0004 already names this module the canonical owner of `git worktree` porcelain parsing — we just promoted an internal helper to the module's public surface to match the documented seam contract. No new dependencies, no behavior change for existing consumers.
- **Commit:** `61fd5dc5` (bundled with Task 1's GREEN — the task that introduced the consumer).

**2. [Rule 1 — Bug] Test fixture missed `tag.gpgsign false` config**

- **Found during:** Task 1 verify (`createAnnotatedTag` test failed with `gpg: skipped …: No secret key`)
- **Issue:** The local `~/.gitconfig` has `tag.gpgsign = true` globally. The test fixture set `commit.gpgsign false` but not `tag.gpgsign`, so `git tag -a` tried (and failed) to GPG-sign in CI/fresh-checkout-style environments without a secret key.
- **Fix:** Added `git config tag.gpgsign false` to the test's `initRepo` helper. Same fix applied to `capture-vcs-baselines.cjs` and `baseline-parity.test.ts` for consistency.
- **Files modified:** `sdk/src/vcs/__tests__/git-backend.test.ts`, `sdk/src/vcs/__tests__/baseline-parity.test.ts`, `tests/__tools__/capture-vcs-baselines.cjs`.
- **Commit:** `61fd5dc5` (bundled with Task 1's GREEN).

**3. [Rule 1 — Bug] findConflicts working-copy test staged the conflict markers — `git diff --check` operates on UNSTAGED working-tree changes vs the index**

- **Found during:** Task 1 verify (`findConflicts({scope:'working-copy'})` returned `[]` instead of detecting the markers)
- **Issue:** The test staged the conflict-marker version of the file with `git add`. `git diff --check` (no `--cached`) compares working tree against index — when staged, there's no working-tree diff, so no markers detected.
- **Fix:** Removed the `git add` after writing markers. Now the test commits a clean version, modifies the working tree to inject markers, and `git diff --check` reports them.
- **Files modified:** `sdk/src/vcs/__tests__/git-backend.test.ts`.
- **Commit:** `61fd5dc5` (bundled with Task 1's GREEN).

**4. [Rule 1 — Bug] workspace.add test path comparison failed on macOS due to /var → /private/var symlink resolution**

- **Found during:** Task 1 verify (`expected [paths] to include '/var/folders/sq/…'`)
- **Issue:** macOS resolves `/var` to `/private/var` via symlink. `git worktree list` records the canonical (resolved) path; the test's `mkdtempSync(tmpdir() + …)` returned the unresolved path. Direct equality failed.
- **Fix:** Use `realpathSync(wtPath)` on both sides of the comparison so symlink resolution is normalized.
- **Files modified:** `sdk/src/vcs/__tests__/git-backend.test.ts`.
- **Commit:** `61fd5dc5` (bundled with Task 1's GREEN).

**5. [Rule 3 — Blocking] Dual-build module specifier resolution (TS1343 + ESM/CJS interop + `node -e` edge case)**

- **Found during:** Task 1 build:cjs (`error TS1343: 'import.meta' is only allowed when 'module' is es2020 or higher`) and follow-up `node -e` smoke (`createRequire received '[eval]'`)
- **Issue:** `backends/git.ts` is dual-compiled by `tsconfig.json` (NodeNext → ESM dist) and `tsconfig.cjs.json` (commonjs → dist-cjs). NodeNext's CJS output has `__filename`; the ESM output has only `import.meta.url`. `tsconfig.cjs.json` rejects `import.meta` syntax (TS1343). Even with eval-deferred parsing, `node -e '…'` evaluation injects `__filename` as the literal string `'[eval]'`, which `createRequire` rejects with `ERR_INVALID_ARG_VALUE`.
- **Fix:** `getCallerSpecifier()` helper does the following in order:
  1. `eval('typeof __filename !== "undefined" ? __filename : null')` — sees lexical scope, picks up Node's CJS module-wrapper local. Filter for absolute-path-looking values (POSIX `/…` or Windows `<drive>:…`) to reject `'[eval]'`.
  2. If that fails or returns non-path, `eval('import.meta.url')` for ESM (deferred parse means CJS host never sees `import.meta` syntax).
  3. If both fail (e.g. `node -e` in CJS host), fall back to `process.cwd() + '/'` so `createRequire` at least gets an absolute path.
- **Files modified:** `sdk/src/vcs/backends/git.ts` (24-line `getCallerSpecifier` helper).
- **Why this is Rule 3, not Rule 4:** No architectural change. The dual-build is fixed (ESM dist + CJS dist-cjs from a single source) — this is the existing convention from plan 01-02's exec/types/index. We're just making the new file work under the same convention. No alternative was a real architectural decision; this is mechanical TS-config plumbing.
- **Commit:** `61fd5dc5` (bundled with Task 1's GREEN).

**6. [Rule 1 — Bug] index.test.ts had assertion against deleted stub behavior**

- **Found during:** Task 2 (replacing the stub broke `it('every method on the stub throws "not yet implemented" (plan 03 swap-in safety)')`)
- **Issue:** Plan 02's index.test.ts asserted that every method on the stub-returned VcsAdapter throws "not yet implemented". Plan 03 explicitly replaces the stub — that assertion is no longer applicable. Without an update, the test fails on the now-real `vcs.commit({message:'x'})` (which actually runs `git commit`).
- **Fix:** Replaced the assertion with `gitOnly.version() returns a real 'git version …' string` — exercises the real wiring, validates plan 03's swap-in, and locks in the contract that plan 02 forecast.
- **Files modified:** `sdk/src/vcs/__tests__/index.test.ts`.
- **Commit:** `75385751` (Task 2).

### Verification Block Re-Interpretation

- Plan's plain-string verify command for the final inline check (`node -e "createVcsAdapter(process.cwd()).gitOnly.version()"`) runs from the project root. Because this very repo is colocated `.git` + `.jj`, auto-detect picks `.jj` and the call throws "jj backend not yet implemented (Phase 3)". This is correct and intended behavior — `createVcsAdapter` honors `.jj` first per `resolveKind`. To validate the git path, force the kind: `createVcsAdapter(process.cwd(), {kind:'git'}).gitOnly.version()`. Documented here for any future reader who runs the verify literally; the CJS smoke test against a tmp git repo (with no `.jj`) is the unambiguous SC-1 proof.

## Authentication Gates

None encountered.

## Threat Surface

Plan's `<threat_model>` covers:
- T-01-03-01 (command injection via argv) — mitigated by argv-array spawnSync at the `execGit` boundary; verified across all 30+ call sites in this plan.
- T-01-03-02 (path traversal in workspace.add) — ADR-0004 path-safety policy stays in worktree-safety.cjs; the adapter is the verb layer per RESEARCH Pitfall 5.
- T-01-03-03 (`__vcsTestOnly` leakage to production) — symbol-gated; production code that imports `VcsAdapter` sees no `__vcsTestOnly` member; access requires explicit `(adapter as unknown as Record<symbol, VcsTestOnly>)[__vcsTestOnly]` or import of the symbol from types.ts.
- T-01-03-04 (gitOnly.version output disclosure) — accepted; `git --version` is public.
- T-01-03-05 (hook script EOP) — mitigated by hook-bridge.ts inheriting cwd/env from the adapter; no privilege boundary crossed beyond what `git commit` already invokes.
- T-01-03-SC (npm/pip/cargo install slopsquat) — mitigated by adding ZERO new dependencies. `createRequire` is a Node 22+ builtin.

No new threat surface beyond the model. No threat-flag items.

## Known Stubs

| File                                                | Stub                                                                                       | Resolution Plan                                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `sdk/src/vcs/backends/git.ts` (`findConflicts`)     | `{scope:'all'}` always returns `[]`                                                        | Phase 3 jj backend implements real `jj log -r 'conflict()'` semantics; verify gate (CONFLICT-03) consumes 'all' scope |
| `sdk/src/vcs/backends/git.ts` (`refs.bookmarks.list`) | Returns Bookmark[] with `rev=''` (no per-item rev-parse)                                    | Phase 1 Open Q2: promote to per-item `git rev-parse <name>` only when a caller demands resolved revs                  |
| `sdk/src/vcs/index.ts` (`createVcsAdapter` jj branch) | Throws `GSDError('jj backend not yet implemented (Phase 3)')` when kind=jj                | Phase 3 implements `createJjAdapter(cwd)` and wires it into the same factory                                          |

These stubs are intentional and tracked. Each fails loudly at runtime (or returns the documented degenerate value) — none silently accepts incomplete behavior.

## Threat Flags

None.

## Self-Check: PASSED

Files created (verified via `[ -f path ]`):
- `sdk/src/vcs/backends/git.ts`
- `sdk/src/vcs/__tests__/git-backend.test.ts`
- `sdk/src/vcs/__tests__/baseline-parity.test.ts`
- `tests/baselines/git-vcs/.gitkeep`
- `tests/baselines/git-vcs/commands-cjs-994-diff-cached.snap.json`
- `tests/baselines/git-vcs/init-cjs-1519-status-porcelain.snap.json`
- `tests/baselines/git-vcs/init-cjs-1538-version.snap.json`
- `tests/baselines/git-vcs/init-cjs-1641-status-porcelain.snap.json`
- `tests/baselines/git-vcs/commit-ts-execGit-3field.snap.json`
- `tests/vcs-cjs-smoke.test.cjs`
- `tests/__tools__/capture-vcs-baselines.cjs`

Files modified (verified via git log):
- `sdk/src/vcs/index.ts` — `createGitAdapterStub` deleted, real `createGitAdapter` wired
- `sdk/src/vcs/__tests__/index.test.ts` — stub-throws assertion replaced
- `get-shit-done/bin/lib/worktree-safety.cjs` — `readWorktreeList` now exported

Commits:
- `1d8c42de` (RED) — failing git-backend.test.ts
- `61fd5dc5` (Task 1 GREEN) — createGitAdapter implementation + test fixes
- `75385751` (Task 2) — wired createVcsAdapter to real backend; baselines dir scaffold
- `b94a492d` (Task 3) — captured baselines + parity test + CJS smoke

Test results:
- `pnpm exec vitest run --project unit src/vcs/__tests__/`: 7 files, **53 tests passed** (5 baseline-parity + 16 git-backend + the 32 carried over from plan 02).
- `node --test tests/vcs-cjs-smoke.test.cjs`: **2 tests passed**.
- `pnpm -F sdk build:cjs`: exit 0; `sdk/dist-cjs/vcs/backends/git.js` exists; plain `require()` returns a real `createGitAdapter` function.
