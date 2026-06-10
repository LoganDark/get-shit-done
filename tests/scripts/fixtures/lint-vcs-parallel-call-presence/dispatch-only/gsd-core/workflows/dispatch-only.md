# Dispatch-Only Fixture (D-14 scenario 2 — negative)

Contains ONLY `workspace.parallel.dispatch` in a bash fence. No fan-in literal
anywhere in any fence. Should trigger exit 1 with a diagnostic naming `fan-in`
as the missing paired call (D-02 bidirectional pairing).

## Dispatch

```bash
HANDLE_JSON=$(echo '{"phase":16,"plans":["16.01"]}' \
  | gsd-sdk query workspace.parallel.dispatch \
    --inputs @- \
    --bookmark-base main)
```

That is intentionally all — this fixture is a negative test.
