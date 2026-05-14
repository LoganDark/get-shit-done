---
name: gsd:migrate-vcs
description: "Bidirectional VCS migration. Rewrites .planning/ between git SHAs and jj change_ids in a single atomic commit and flips vcs.adapter to match."
argument-hint: "[--target jj|git] [--native] [--force]"
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---

<objective>
Bidirectional VCS migration. Migrates a project's `.planning/` revision-id
encodings between git SHAs and jj change_ids in a single atomic commit,
flipping `vcs.adapter` in `.planning/config.json` to match. Round-trip
safe (git → jj → git) and idempotent: re-running on an already-migrated
repo no-ops via the `[gsd-migrate-vcs v1]` commit-message marker probe.

**Flags:**
- `--target jj|git` — migration direction (defaulted from current adapter
  when omitted; refuses when current adapter equals the inferred default
  to avoid ambiguous intent).
- `--native` — on `--target jj`, use `jj git init --no-colocate` (pure jj
  store, no `.git/` interop). Default is colocated.
- `--force` — bypass dirty-tree / conflicts pre-flight refusal.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/migrate-vcs.md
@~/.claude/get-shit-done/references/ui-brand.md
@~/.claude/get-shit-done/references/gate-prompts.md
</execution_context>

<context>
$ARGUMENTS
</context>

<process>
Execute end-to-end.
</process>
