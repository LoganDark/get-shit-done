# VcsAdapter Surface Audit — Drop Git-Only Concepts

**Authored:** 2026-05-11
**Purpose:** Pre-discuss-phase intel for the proposed Phase 2.5 (VCS Abstraction Audit). Catalogues every verb / field / factory currently on the cross-backend surface, evaluates against the architectural rule, and lists call-site impact.

## Architectural rule (proposed for discuss-phase as D-01)

> **VcsAdapter exposes only operations with a direct jj equivalent.** Operations that require multiple git commands internally are preferred over operations that have no jj analog. No git-only primitives leak onto the cross-backend surface — they live under `vcs.gitOnly.*` (after `vcs.kind === 'git'` narrowing) or are removed entirely.

Corollary rules:

- **D-02 (proposed):** `vcs.commit({ files })` takes a single `files: string[]` list of changed paths. Backend does `git add + git commit -- <paths>` internally on git; `jj commit -- <paths>` on jj. **No separate `pathspec` field, no separate `additions`/`deletions` fields.** Deletions are recorded by deleting the file in the working copy and including its path in `files`.
- **D-03 (proposed):** No `vcs.stage` / `vcs.unstage` on the cross-backend surface. The staging concept is git-only; there is no jj equivalent.

## Verdict table

Legend:
- ✅ **KEEP** — direct jj equivalent exists
- 🔧 **KEEP (reshape)** — concept exists in both but current shape leaks git terminology / git-only fields
- 🚫 **REMOVE** — no jj equivalent; fold callers into a cross-backend verb
- ➡️ **MOVE → gitOnly** — concept is git-flavored; preserve via `vcs.gitOnly.*` narrowing

### `VcsAdapterCommon`

| Verb | Verdict | Notes | Call sites |
|------|---------|-------|------------|
| `commit(input: CommitInput)` | 🔧 KEEP (reshape) | Collapse `files` / `pathspec` into single `files: string[]` per D-02; semantics change from "stage these paths" to "commit these paths' working-copy state" | many |
| `log(opts?: LogOpts)` | ✅ KEEP | `jj log` exists; `allRefs` maps to jj `all()` revset | many |
| `status(opts?: StatusOpts)` | 🔧 KEEP (reshape) | `StatusEntry.index` is git-only (jj has no index). Drop `index` field; keep `path` + `worktree` | many |
| `diff(opts?: DiffOpts)` | 🔧 KEEP (reshape) | Drop `DiffOpts.staged` (git-only); zero callers use it today | 0 stagedrefs |
| `findConflicts({scope})` | ✅ KEEP | jj has first-class conflicts; scope distinction maps; document model difference | (in verify) |
| `push(opts?)` | ✅ KEEP | `jj git push` exists — jj has full git-remote interop via `jj git *` subcommands | 1 |
| `fetch(opts?)` | ✅ KEEP | `jj git fetch` exists | 0 |
| `stage(files)` | 🚫 REMOVE | Git-only (no jj index). Callers refactor onto `vcs.commit({files})` | **34** |
| `unstage(files)` | 🚫 REMOVE | Git-only. Deletions: caller deletes file in WC, includes path in `commit.files` | **7** |
| `cwd` (readonly) | ✅ KEEP | Both backends operate in a cwd | — |

### `VcsRefs`

| Verb | Verdict | Notes | Call sites |
|------|---------|-------|------------|
| `head` (RevisionExpr) | ✅ KEEP | `HEAD` / `@` | many |
| `parent` (RevisionExpr) | ✅ KEEP | `HEAD^` / `@-` | many |
| `bookmarks` (namespace) | ✅ KEEP | Native jj terminology | many |
| `currentBranch()` | 🔧 KEEP (reshape) | Rename to `currentBookmark()` to match `bookmarks.*` naming. Semantic: bookmark/branch at `HEAD`/`@`, null if anonymous/detached | **10** |
| `resolveShort(rev)` | ✅ KEEP | Both have short-id resolution. Document: returns commit-hash-prefix on git; commit_id-prefix on jj (NOT change_id) | (few) |
| `countCommits({rev?})` | ✅ KEEP | Both can count revs in a revset | (few) |
| `rootCommits({rev?})` | ✅ KEEP | Both have root commits; jj has `root()` revset | (few) |
| `exists(rev)` | ✅ KEEP | Both resolve rev expressions | many (verify.cjs) |
| `isIgnored(path)` | 🔧 KEEP (or MOVE) | `.gitignore` semantics. jj reads `.gitignore` in colocated mode; jj-native has different model. **Open question for discuss-phase:** keep with documented dual-semantic, or move to gitOnly | **6** |
| `remotes()` | ✅ KEEP | `jj git remote list` exists; revset `remote_bookmarks()` exposes per-remote refs | **5** |

### `VcsBookmarks`

| Verb | Verdict | Notes | Call sites |
|------|---------|-------|------------|
| `list()` | ✅ KEEP | Both have | (few) |
| `create(name, rev)` | ✅ KEEP | Both have | (few) |
| `move(name, rev)` | ✅ KEEP | jj bookmarks are movable; git branches are too | (few) |
| `delete(name)` | ✅ KEEP | Both have | (few) |
| `exists(name)` | ✅ KEEP | Both have | (few) |
| `switch(name, opts?)` | ✅ KEEP | Maps to `git switch` / `jj edit <bookmark>` | (few) |

### `VcsWorkspace`

| Verb | Verdict | Notes | Call sites |
|------|---------|-------|------------|
| `add({path, baseRef?})` | ✅ KEEP | `git worktree add` / `jj workspace add` | (few) |
| `forget(path)` | ✅ KEEP | Both have | (few) |
| `list()` | ✅ KEEP | Both have | many |
| `context()` | 🔧 KEEP (reshape) | Return shape `{effectiveRoot, mode, isLinked}` cross-backend; **drop `gitDir` and `gitCommonDir` fields** (pure git paths). Move those two fields to a gitOnly call site — likely `vcs.gitOnly.gitDir()` and `vcs.gitOnly.gitCommonDir()` since worktree-safety.cjs:122-123 needs them | gitDir: **5**, gitCommonDir: **6** |
| `prune()` | ✅ KEEP | `git worktree prune` / `jj workspace forget --all` (rough) | (few) |

### `VcsHooks`

| Verb | Verdict | Notes | Call sites |
|------|---------|-------|------------|
| `fire(stage, ctx?)` | ➡️ MOVE → gitOnly | git pre-commit/pre-push hooks. jj has nascent hook support but not the same model. **Open question for discuss-phase:** move to gitOnly outright, or keep as no-op on jj? | **4** |

### `CommitInput` (proposed reshape per D-02)

Current shape:
```ts
{ files?: string[], message: string, allowEmpty?: boolean,
  amend?: boolean, noVerify?: boolean, pathspec?: string[] }
```

Proposed shape:
```ts
{
  files?: string[],          // changed paths to capture (mix of add/mod/del). undefined = all tracked
  message: string,
  allowEmpty?: boolean,
  amend?: boolean,           // KEEP — jj has equivalent (squash into parent + describe --no-edit)
  noVerify?: boolean,        // OPEN QUESTION — keep with no-op-on-jj or move to gitOnly?
}
```

Changes:
- **Remove `pathspec`** — collapse into `files` (current 10 callers use `vcs.commit({pathspec})`; they need to be refactored to use `files` with new semantics).
- **`files` semantics change** — was "paths to stage before committing"; becomes "paths whose working-copy state to capture in commit." For deletions, the caller deletes the file in the working copy and includes the path in `files`; the backend records the deletion.
- **`amend: boolean`** — jj has `jj squash --into @-` + `jj describe --no-edit` as the rough equivalent. Document the dual-semantic. 4 callers.
- **`noVerify: boolean`** — open question for discuss-phase (4 callers).

### `expr.*` factories

| Factory | Verdict | Notes |
|---------|---------|-------|
| `expr.head()` | ✅ KEEP | Both |
| `expr.parent()` | ✅ KEEP | Both |
| `expr.bookmark(name)` | ✅ KEEP | Both |
| `expr.remote(branch, remoteName)` | ✅ KEEP | jj has the `<bookmark>@<remote>` revset syntax for the same concept (e.g. `main@origin`) — maps cleanly. Translator emits `<remote>/<branch>` for git, `<branch>@<remote>` for jj |
| `expr.range(from, to)` | ✅ KEEP | Both have ranges |
| `expr.commit(sha)` | 🔧 KEEP (clarify) | Currently validates 4-40 hex (commit-hash-shape). On jj, `commit_id` is also hex; `change_id` uses different alphabet. Document: this is **commit-hash-shape, not change-id-shape**. **Open question:** should there be a separate `expr.change(changeId)` for jj-flavored callers? Probably defer to Phase 3. |

### `GitOnlyOps` (already gitOnly)

| Verb | Verdict | Notes |
|------|---------|-------|
| `createAnnotatedTag` | ✅ STAY gitOnly | jj doesn't have annotated tags (only lightweight refs) |
| `version()` | ✅ STAY gitOnly | `git --version` |
| `init()` | 🔧 PROMOTE? | jj has `jj init` and `jj git init`. **Open question:** promote to cross-backend `vcs.init()`? Currently 1 caller (init-runner.ts). |
| `configGet(key)` | 🔧 PROMOTE? | `jj config get`. Promote to cross-backend? |
| `configSet(key, val)` | 🔧 PROMOTE? | `jj config set`. Promote to cross-backend? |

## Call-site impact summary

Refactor scope by verb:

| Verb to remove/move | Callers | Refactor target |
|---------------------|---------|-----------------|
| `vcs.stage` | 34 | Fold into `vcs.commit({files})` |
| `vcs.unstage` | 7 | Fold into `vcs.commit({files})` (delete file in WC + include path) |
| `vcs.commit({ pathspec })` | 10 | Collapse `pathspec` → `files` |
| `vcs.refs.currentBranch()` | 10 | Rename to `currentBookmark()` |
| `vcs.refs.isIgnored()` | 6 | Open — see discuss-phase question |
| `vcs.hooks.fire()` | 4 | Open — see discuss-phase question |
| `WorkspaceContext.gitDir` reads | 5 | `vcs.gitOnly.gitDir()` |
| `WorkspaceContext.gitCommonDir` reads | 6 | `vcs.gitOnly.gitCommonDir()` |
| `StatusEntry.index` reads | TBD (audit) | Drop field or move to git-only result variant |
| `DiffOpts.staged` | 0 | (no-op — surface change only) |

**Total cross-backend → gitOnly migrations:** ~11 call sites firm (gitDir 5 + gitCommonDir 6) + up to 10 more depending on open questions (isIgnored 6, hooks 4).

**Total surface-removal refactors:** ~51 call sites (stage 34 + unstage 7 + commit pathspec 10).

**Total surface-rename refactors:** ~10 call sites (currentBranch → currentBookmark).

## Open questions for discuss-phase

1. **`vcs.refs.isIgnored`** — keep cross-backend with documented dual-semantic (jj reads .gitignore in colocated mode; jj-native has `jj file untrack`), or move to gitOnly outright? 6 callers.
2. **`vcs.hooks.fire`** — git has pre-commit/pre-push hooks; jj has growing-but-not-equivalent hook support. Move to gitOnly, or keep cross-backend as no-op on jj? 4 callers.
3. **`CommitInput.noVerify`** — equivalent to "skip hook verification"; depends on the answer to Q2. 4 callers.
4. **`init` / `configGet` / `configSet`** — promote from gitOnly to cross-backend (`vcs.init()`, etc.) since `jj init` / `jj git init` / `jj config get|set` all exist? Or keep gitOnly because the colocated-vs-native semantics deserve explicit narrowing?
5. **`StatusEntry.index`** — drop entirely from cross-backend `StatusEntry`, or keep with documented "always empty on jj"? Audit callers first.
6. **Annotated tags (`vcs.gitOnly.createAnnotatedTag`)** — stays gitOnly because jj doesn't have a native annotated-tag concept (only lightweight tag refs in colocated mode). Confirm.

## Sequencing & risk notes

- This phase touches the public adapter type surface, so EVERY downstream caller compiles against the new shape. Refactor is mechanical but wide.
- The deletion-of-stage/unstage refactor is the deepest single change. The 34 `vcs.stage` callers are concentrated in 3 patterns (per Phase 2 LEARNINGS surprises #11): test fixture setup, cmdCommit block, deletion-synthesis in commit.ts. Each pattern can be refactored uniformly.
- Phase 2's baseline-parity test (`sdk/src/vcs/__tests__/baseline-parity.test.ts`) will need its `vcs.stage(...)` calls replaced with the new `vcs.commit({files})` shape. ~55 baselines still cover the wire-level behavior; per-fixture re-init pattern from 02-07 SUMMARY still applies.
- Phase 2's lint guard (`scripts/lint-vcs-no-raw-git.cjs`) is unrelated to this refactor — it stays clean.
- This phase does NOT touch jj backend code (still Phase 3). It only adjusts the cross-backend interface and the existing git backend to match.
- Suggested mode: like Phase 2 in spirit (mechanical refactor commits per pattern), but D-08 mechanical-only doesn't bind — small surrounding-logic cleanups are fine when they fall out naturally from a verb-shape change.

## Cross-references

- `.planning/phases/02-bulk-call-site-migration-still-git-only/02-LEARNINGS.md` Surprise #1 (17 forward-complete gaps surfaced from direct reading) — this audit is the cleanup of those gap-fills that turned out NOT to be cross-backend.
- `.planning/phases/01-adapter-foundation-git-backend/01-CONTEXT.md` D-04 (forward-complete adapter), D-07 (gitOnly narrowing), D-12 (no `expr.raw()`).
- `sdk/src/vcs/types.ts` — current authoritative type surface (this audit's input).
- `sdk/src/vcs/expr.ts` — current factory surface.
