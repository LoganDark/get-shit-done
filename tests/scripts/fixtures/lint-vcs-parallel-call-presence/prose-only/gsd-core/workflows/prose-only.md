# Prose-Only Fixture (D-14 scenario 4 — Pitfall 7 false-positive guard)

This fixture is the load-bearing test that the lint does NOT trip on
prose-only mentions of "parallel", "wave", or "Task(" — exactly the pattern
in real workflows like `code-review.md` and `audit-fix.md` that mention these
words conceptually but never invoke `workspace.parallel.dispatch` /
`workspace.parallel.fan-in` in any fence.

## Coordination

This workflow coordinates a wave of parallel review tasks. The orchestrator
spawns a Task(...) per file and aggregates results. None of this is actually
parallel-dispatch through the SDK — the wave coordination is in-process.

The words parallel, wave, and Task( appear in prose above. They MUST NOT
trigger the lint because the lint scopes literal detection to bash/sh/zsh
fence content, not prose.

## Example shell snippet (deliberately NOT using parallel-dispatch verbs)

```bash
# This shell fence is harmless — it does NOT contain the dispatch or fan-in
# literal substring, only an unrelated example command.
echo "Reviewing a single file synchronously"
ls -la
```

The lint should exit 0 against this fixture.
