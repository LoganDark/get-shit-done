---
title: Harden refs.bookmarks {create,move,delete,exists} against argv injection in `raw:true` mode
source: phase-03 code-review CR-01
created: 2026-05-12
priority: critical
cross_backend: true
resolves_phase: null
---

## Summary

`refs.bookmarks.{create, move, delete, exists}` called with `opts.raw === true` (the D-04 escape hatch that bypasses the `gsd/` prefix) does not validate the `name` argument. A caller passing `name = '-D'` or `name = '--delete'` would land that string at argv flag position in either:

- `jj bookmark create -B <name>` / `jj bookmark move <name> -r ...` / `jj bookmark delete <name>` on the jj backend
- `git branch -D <name>` / `git branch <name>` / `git branch -m <old> <new>` on the git backend

The `gsd/` prefix accidentally blocks the leading-`-` form, so non-raw callers are safe by happy accident. Raw callers lose that incidental protection.

## Why deferred from Phase 3

This is a **cross-backend** hardening item, not a phase-3-only bug. Fixing only the jj side would leave the git side asymmetrically unprotected and contract-incoherent. The proper fix is:

1. Add a refname validator (e.g., `expr.bookmark()` already has one) and apply it to ALL `refs.bookmarks.*` write paths in both backends when `opts.raw === true`.
2. Insert `--` end-of-options separator where the name is a positional argv that follows possible flags.
3. Decide whether to extend the same validator coverage to non-raw paths as defense-in-depth (the `gsd/` prefix is incidental, not a contract).

## Threat model context

- Caller is internal SDK consumer; argv flows are not user-facing.
- Code-review verdict: critical for hardening, but not a phase-goal miss.
- Phase 3 verifier accepted this as a follow-up in the `human_verification:` frontmatter of `03-VERIFICATION.md`.

## Acceptance criteria for the fix plan

- [ ] Cross-backend refname validator wired into both `git.ts` and `jj.ts` bookmark write paths
- [ ] `--` separator inserted before positional name argv where applicable
- [ ] Tests that pass `-D`/`--force-delete`/`--push-option=...` as `name` with `raw:true` and assert rejection (NOT execution)
- [ ] Tests added for both backends with `vcs.adapter` matrix coverage
- [ ] No raw `git` violations introduced (lint guard still 0)

## References

- `.planning/phases/03-jj-backend-core-squash-refs-conflict/03-REVIEW.md` § CR-01
- `.planning/phases/03-jj-backend-core-squash-refs-conflict/03-VERIFICATION.md` `human_verification:`

---

## Closure (2026-05-13)

Closed by Phase 4 plan 04-07 (D-24 fold-in).

- Refname validator lifted from `sdk/src/vcs/expr.ts:38-61` to shared module `sdk/src/vcs/refs-validator.ts` (`validateRefname`).
- Threaded through `refs.bookmarks.{create,move,delete,exists}` on BOTH backends (`sdk/src/vcs/backends/jj.ts` + `sdk/src/vcs/backends/git.ts`) — applied for `opts.raw === true` AND non-raw paths (defense-in-depth; the `gsd/` prefix is incidental protection, not contract).
- `--` end-of-options separator inserted at argv positions before the bookmark/branch name on both backends (jj: `bookmark create -r <rev> -- <name>`, `bookmark move --to <rev> -- <name>`, `bookmark delete -- <name>`, `bookmark list -- <name>`; git: `branch -- <name> <rev>`, `branch -f -- <name> <rev>`, `branch -D -- <name>`).
- Contract tests: `sdk/src/vcs/__tests__/refname-validator.test.ts` — 43 cases covering unit-level validator rejection (argv-injection + refname-format rules) and integration-level `bookmarks.*` rejection on git AND jj-colocated, plus legitimate-name round-trip regression.

Verified: `vcs.refs.bookmarks.create('-D', expr.head(), {raw: true})` THROWS before reaching argv on both backends.

### Acceptance-criteria fulfillment

- [x] Cross-backend refname validator wired into both `git.ts` and `jj.ts` bookmark write paths
- [x] `--` separator inserted before positional name argv where applicable
- [x] Tests that pass `-D`/`--force-delete`/`--push-option=...` as `name` with `raw:true` and assert rejection (NOT execution)
- [x] Tests added for both backends with `vcs.adapter` matrix coverage
- [x] No raw `git` violations introduced (lint guard still 0)
