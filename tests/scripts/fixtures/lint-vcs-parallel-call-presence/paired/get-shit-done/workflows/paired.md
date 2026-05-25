# Paired Fixture (D-14 scenario 1)

Mirrors the empirical structure of `get-shit-done/workflows/execute-phase.md`:
the dispatch and fan-in literals live in SEPARATE bash fences in different
sections, matching the file-level pairing scope of D-01.

## Dispatch

The phase orchestrator dispatches one workspace per plan.

```bash
HANDLE_JSON=$(echo '{"phase":16,"plans":["16.01","16.02"]}' \
  | gsd-sdk query workspace.parallel.dispatch \
    --inputs @- \
    --bookmark-base main)
```

## Other unrelated content

Some prose between the two sections to mirror real workflows.

## Fan-in

After all dispatched workspaces complete, fan-in merges them back.

```bash
MERGE_JSON=$(echo '[{"agentId":"a","exitCode":0}]' \
  | gsd-sdk query workspace.parallel.fan-in --handle "@$HANDLE_FILE" --results @-)
```
