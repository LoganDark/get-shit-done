# Upstream Rebase Log (BROWN-02)

Per Phase 6 ROADMAP success criterion: every upstream rebase of this jj-port
fork against `glittercowboy/get-shit-done` records its conflict shape here.
Format is a single 3-column row per rebase. The retrospective surfaces
repeated friction (e.g. files that conflict on every rebase) so we can target
them for an upstream-friendly refactor.

| Date | Conflicts | Notes |
|------|-----------|-------|
| _(no entries yet — first weekly rebase will be recorded here)_ |  |  |

## Logging conventions

- **Date:** ISO `YYYY-MM-DD`.
- **Conflicts:** small integer count of distinct files that needed manual
  resolution (rerere hits don't count once cached).
- **Notes:** which files / what was the recurring shape / any pattern worth
  pulling forward into a refactor.

When recording a rebase, append a row to the table and (optionally) push the
deepest pattern up into PROJECT.md's "Upstream friction" section.
