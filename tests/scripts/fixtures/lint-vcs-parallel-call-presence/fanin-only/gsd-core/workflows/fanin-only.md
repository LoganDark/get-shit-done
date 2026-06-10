# Fan-in-Only Fixture (D-14 scenario 3 — negative)

Contains ONLY `workspace.parallel.fan-in` in a bash fence. No dispatch literal
anywhere in any fence. Should trigger exit 1 with a diagnostic naming
`dispatch` as the missing paired call (D-02 vice-versa direction).

## Fan-in

```bash
MERGE_JSON=$(echo '[{"agentId":"a","exitCode":0}]' \
  | gsd-sdk query workspace.parallel.fan-in --handle "@$HANDLE_FILE" --results @-)
```

That is intentionally all — this fixture is a negative test.
