# Allowlist Fixture (D-14 scenario 5 — opted-out)

Contains the dispatch literal in a bash fence but NOT the fan-in literal.
Would normally fail the lint, but a per-entry allowlist entry of shape
`{path, reason, owner}` would suppress it. This file exists so Task 2's
allowlist test has a concrete example to reason about.

The Task 2 test (per PLAN behavior note option (c)) does NOT invoke the lint
against this fixture directly — instead it calls `parseAllowlist(...)` from
`scripts/lib/allowlist-parser.cjs` with a fixture JSON containing this file's
relative path and asserts the returned `files` Set contains the entry. This
proves the path-suppression mechanism works without requiring fixture +
production-allowlist coupling.

## Dispatch (no fan-in)

```bash
HANDLE_JSON=$(echo '{"phase":16,"plans":["16.01"]}' \
  | gsd-sdk query workspace.parallel.dispatch \
    --inputs @- \
    --bookmark-base main)
```
