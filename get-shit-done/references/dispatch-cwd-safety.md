# Dispatch CWD Safety

Precondition guard for subagent prompts: assert the agent's cwd is a dispatched
subagent workspace (not the primary workspace, not a drifted cwd, not a path
outside any workspace). Backed by the SDK verb
`gsd-sdk query workspace.assert-dispatched-cwd --cwd .`, which is backend-opaque
— the same single call covers git worktrees, jj workspaces, and any future
backend that implements the `vcs.workspace.list()` contract.

---

## Verb shape

`gsd-sdk query workspace.assert-dispatched-cwd --cwd <path>` returns JSON:

```json
{
  "ok": boolean,
  "workspaceName": string | null,
  "workspacePath": string | null,
  "isPrimary": boolean
}
```

- `ok` is `true` iff `cwd` resolves to a workspace from `vcs.workspace.list()`
  AND that workspace is NOT the primary (`list()[0]` by convention).
- `workspaceName` / `workspacePath` carry the matched workspace identity (on git
  this is an fs path; on jj this is the workspace name — documented backend
  asymmetry). Both are explicit `null` (not undefined) on the no-match branch so
  the JSON envelope shape stays stable across `JSON.stringify`.
- `isPrimary` is `true` if cwd matched `list()[0]`; `false` otherwise (including
  the no-match case).

---

## Failure modes the verb catches by construction

**cwd drifted into the primary workspace.** A prior shell call may have `cd`'d
out of the dispatched workspace into the main repo. The verb resolves cwd
against the workspace list and returns `isPrimary: true, ok: false` — the
agent halts before staging. This subsumes the former cwd-drift sentinel
(historically issue #3097).

**cwd outside any dispatched workspace.** An absolute path constructed from the
orchestrator's `pwd` resolves into the main repo, not the workspace. When the
agent's cwd lands there, the verb returns `workspaceName: null, ok: false` —
the agent halts before writing. This subsumes the former absolute-path guard
(historically issue #3099).

**Workspace HEAD on a protected ref or outside the agent namespace.** Being in
a non-primary dispatched workspace means the agent is on the per-agent branch
the orchestrator created. The workspace-locating predicate excludes the
primary by construction, and the orchestrator only attaches dispatched
workspaces to per-agent refs — so the protected-ref deny-list and the
worktree-agent-* namespace allow-list are both implied. This subsumes the
former HEAD safety assertion (historically issue #2924).

---

## Usage in agent prompts

Place at the start of any commit-staging or write-side protocol block:

```bash
DISPATCH_CHECK=$(gsd-sdk query workspace.assert-dispatched-cwd --cwd .)
OK=$(echo "$DISPATCH_CHECK" | jq -r '.ok')
if [ "$OK" != "true" ]; then
  IS_PRIMARY=$(echo "$DISPATCH_CHECK" | jq -r '.isPrimary')
  WS_NAME=$(echo "$DISPATCH_CHECK" | jq -r '.workspaceName // "<unknown>"')
  echo "FATAL: cwd is not a dispatched subagent workspace (isPrimary=$IS_PRIMARY, workspaceName=$WS_NAME)." >&2
  echo "RECOVERY: cd into the workspace path the orchestrator passed to this Agent() invocation." >&2
  exit 1
fi
```

The check is one subprocess call per agent dispatch. Latency adds ~50–200 ms
per Agent() invocation — annotated as a Phase 14 dogfood-metrics watch item
in case wave-of-N amortizes badly at high N.

---

## Recovery

When the verb returns `ok: false`, the agent exits 1. The orchestrator that
invoked `Agent()` is responsible for re-dispatching with the correct workspace
cwd. Agents do NOT attempt to self-recover by `cd`'ing or by force-rewinding
refs — that would silently destroy concurrent work in multi-active scenarios.
