# Phase 19 deferred items

Out-of-scope discoveries logged during execution (scope-boundary rule). Not fixed in the discovering plan.

| # | Found in | Item | Suggested home |
|---|----------|------|----------------|
| 1 | 19-04 Task 2 | `scripts/changeset/github-release-notes.cjs` resolved to the upstream side (raw `runGit` + `package-identity.cjs` defaults). The fork's Phase 7 MIGR-05 VcsAdapter migration of this script (runGit → `createVcsAdapter`/`expr`, adapter-cache per repo) was NOT re-applied because its require target (`sdk/dist-cjs/vcs/index.js`) is retired and the ported adapter entry (`gsd-core/bin/lib/vcs/index.cjs`) only exists after 19-05. Re-apply the adapter migration (re-pointed at the ported entry) when migrating raw-git call sites — 19-07-class work; if 19-07's scope stays src/*.cts-only, 19-13 must reconcile this row. | 19-07 (or 19-13 reconciliation) |
