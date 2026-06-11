completed: 2026-06-11
---
title: query commit envelope defects — reports head (@) change_id instead of created commit (@-) on jj; absolute --files paths silently return nothing_to_commit
source: phase-18 UAT session (operator observation + gap-closure planner observation, 2026-06-11)
created: 2026-06-11
priority: medium
cross_backend: true
resolves_phase: null
---

## Summary

Two independent defects in `gsd-tools query commit` (`cmdCommit`, `src/commands.cts`), both observed live during the Phase 18 UAT session:

### Defect 1 — envelope `id` is the post-commit head, not the created commit (jj only)

`src/commands.cts:746-752` builds the success envelope with:

```
id = vcs.refs.resolveShort(vcs.refs.head);
```

On git, head after commit IS the created commit, so this is correct. On jj, the squash-model commit (`jj squash -B @ -k`) leaves the WC as a **new empty change** — `refs.head` resolves to `@`, while the created commit sits at `@-`. Every commit in a session therefore reports the same stable WC change prefix instead of the created commit's change_id.

**Evidence (2026-06-11 session):** five consecutive `query commit` invocations all returned `{"committed": true, "id": "srz", "reason": "committed"}` (the WC change `srzmqvsu`), while `jj log` showed distinct created commits (e.g. `pptwokrp` for `docs(phase-18): mark phase verified after UAT`).

**The correct value is already computed and discarded:** the jj backend's `commit()` explicitly resolves `@-` post-squash and returns its change_id in `CommitResult.id` (`src/vcs/backends/jj.cts:234-238`; the `CommitResult.id` contract at `src/vcs/types.cts:107-118` documents it as "the newly-created commit"). `cmdCommit` ignores `commitResult.id` and re-resolves head.

**Impact:** any consumer recording "the commit we just made" (SUMMARY change-id lists, plan metadata, manifests, orchestrator transcripts) records a wrong, reused-looking ID. All Phase ≤18 SUMMARY "Task Commits" change_ids sourced from commit envelopes are suspect.

### Defect 2 — absolute `--files` paths silently return `nothing_to_commit`

`src/commands.cts:643-653` (the #2014 missing-path filter):

```
filesToCommit = filesRequested.filter(f => fs.existsSync(path.join(cwd, f)))
```

`path.join(cwd, '/abs/path')` concatenates rather than re-roots on POSIX, producing a nonexistent path — so every absolute path is filtered out and the explicit-files short-circuit at line 649 returns `{committed:false, reason:'nothing_to_commit'}` with exit 0. Even if the filter passed, the status-entry scope match at line 689 (`e.path.startsWith(p)`) compares repo-relative entry paths against the absolute spec and can never match.

**Evidence:** hit by the 18-04 gap-closure planner agent (2026-06-11) — its commit with absolute `--files` paths no-op'd silently; retrying with repo-relative paths committed fine.

**Impact:** silent data-loss-shaped failure — the caller believes nothing changed when in fact their commit was never attempted. Especially hazardous for orchestrator workflows that treat `nothing_to_commit` as a benign no-op.

## Acceptance criteria for the fix plan

Defect 1:

- [x] `cmdCommit` success envelope `id` comes from `commitResult.id` (the backend-computed created-revision id), not from re-resolving `refs.head`; shorten via `resolveShort` only if envelope length parity requires it
- [x] Contract test (both backends via `GSD_TEST_BACKENDS` matrix): commit, then assert envelope `id` resolves to the commit whose description is the message just passed — and on jj that it does NOT equal `@`'s change_id
- [x] Survey envelope consumers (workflows/agents parsing `.id`) for anything depending on the old head-id behavior; none expected, record findings

Defect 2:

- [x] Absolute `--files` paths under the repo root are normalized to repo-relative (e.g. `path.relative(cwd, f)` when `path.isAbsolute(f)`) before the missing-path filter and status-scope match — OR rejected loudly with a structured `{ok:false, reason:'absolute_path_unsupported'}`-style envelope; silent `nothing_to_commit` is not acceptable for this case
- [x] Absolute paths OUTSIDE the repo root fail loudly (never silently no-op, never escape the repo scope)
- [x] Contract test: commit with an absolute path to a genuinely-dirty tracked file asserts either a successful commit of that file or the loud rejection — not `nothing_to_commit`

Both:

- [x] No raw git introduced; all four lint/audit gates stay green (no-raw-git, no-commit-id, call-presence, audit-workflow-raw-git 230-hit baseline)

## References

- `src/commands.cts:643-653` (#2014 filter), `:689` (scope match), `:746-752` (id resolution)
- `src/vcs/backends/jj.cts:164-238` (squash commit + correct `@-` id resolution)
- `src/vcs/types.cts:107-118` (`CommitResult.id` contract)
- Memory: `project_query_commit_reports_head_id.md`
- Session: Phase 18 UAT / gap-closure planning, 2026-06-11
