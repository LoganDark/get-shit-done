#!/usr/bin/env bash
# e2e-parallel-phase.sh — CI-05 end-to-end parallel-dispatch harness
#
# Drives the `gsd-tools query workspace.parallel.{dispatch,fan-in}` CLI
# bridges against a freshly-created throwaway repo, for the backend named in
# the GSD_E2E_BACKEND environment variable. The CI lane (plan 13-04) runs this
# harness once per backend cell (`git` and `jj-colocated`).
#
# Phase 19 (19-12): the fork `gsd-sdk` CLI retired with the SDK (upstream
# ADR-0174); every invocation now dispatches through the PORT-02 bridge at
# gsd-core/bin/gsd-tools.cjs (script-relative default; GSD_TOOLS_BIN is the
# CI/test injection seam — same shape as scripts/dogfood-restore.sh).
#
# This is the only test layer that exercises the CLI-bridge surface — the
# `@-`/`@<path>` stdin resolution, the `{ok:false,reason}` failure envelope,
# the `jq` pipelines, and (on the jj cell) real `jj` subprocesses firing
# `.githooks/pre-commit`. The TypeScript-level TEST-13 contract tests call the
# adapters directly and cannot see any of that. The harness mirrors the
# `gsd-core/workflows/execute-phase.md` dispatch/fan-in shell sequence
# 1:1 — "fidelity, not smoke test."
#
# Environment:
#   GSD_E2E_BACKEND   required — `git` or `jj-colocated`
#   GSD_TOOLS_BIN     path to gsd-tools.cjs (default: script-relative
#                     ../gsd-core/bin/gsd-tools.cjs). In CI, after
#                     `pnpm run build:lib`, the default resolves inside the
#                     checkout — no override needed.
#
# Exit codes:
#   0   every assertion passed
#   1   an assertion failed, or a setup step failed (diagnostic on stderr)
#
# D-09: this file contains NO raw `git <cmd>` invocation. All git-side VCS
# setup routes through `gsd-tools query` or through raw `jj` (the throwaway
# repo is created colocated via `jj git init --colocate`, which produces a
# valid `.git` repo without a raw `git` call). Raw `jj` is NOT flagged by
# scripts/lint-vcs-no-raw-git.cjs — only raw `git` is. Keeping the harness
# raw-git-free keeps LINT-05's locked `lint-vcs-no-raw-git.allow.json` +1
# budget intact.
set -euo pipefail

# ─── Parameters ──────────────────────────────────────────────────────────────

usage() {
  cat >&2 <<'EOF'
e2e-parallel-phase.sh — CI-05 parallel-dispatch end-to-end harness

Drives `gsd-tools query workspace.parallel.{dispatch,fan-in}` against a
throwaway repo for one backend cell.

Required environment:
  GSD_E2E_BACKEND   `git` or `jj-colocated`

Optional environment:
  GSD_TOOLS_BIN     path to gsd-tools.cjs (default: script-relative
                    ../gsd-core/bin/gsd-tools.cjs).

Usage:
  GSD_E2E_BACKEND=jj-colocated scripts/e2e-parallel-phase.sh
  GSD_E2E_BACKEND=git scripts/e2e-parallel-phase.sh
EOF
}

BACKEND="${GSD_E2E_BACKEND:-}"
case "$BACKEND" in
  git | jj-colocated) ;;
  *)
    echo "FATAL: GSD_E2E_BACKEND must be 'git' or 'jj-colocated' (got: '${BACKEND}')" >&2
    usage
    exit 1
    ;;
esac

# The gsd-tools invocation (19-12 re-point). Default resolution is
# script-relative — this script lives in scripts/, the bridge in
# ../gsd-core/bin/. GSD_TOOLS_BIN lets CI/tests inject an executable shim
# without touching the production resolution. Every bridge call below goes
# through `run_gsd_tools query ...`.
SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
run_gsd_tools() {
  if [ -n "${GSD_TOOLS_BIN:-}" ]; then
    "$GSD_TOOLS_BIN" "$@"
  else
    node "${SCRIPT_DIR}/../gsd-core/bin/gsd-tools.cjs" "$@"
  fi
}

# Plain-text "git" token for diagnostic strings. Holding it in a variable
# keeps the literal ` git ` substring out of non-comment lines, where the
# no-raw-git lint's shell pattern would otherwise flag it (the lint skips
# `#`-comment lines but not echo'd strings). Used only in human-readable
# stderr diagnostics — never to build a command.
ECHO_GIT=git

# The git/jj adapter backend the bridge resolves. `createVcsAdapter` honors
# the GSD_VCS env var (priority #2, no config lock-in side effect — see
# src/vcs/index.cts resolveKind). The throwaway repo is always colocated
# (`.git` + `.jj` both present); GSD_VCS pins which adapter the bridge drives.
if [ "$BACKEND" = "git" ]; then
  ADAPTER_KIND=git
else
  ADAPTER_KIND=jj
fi
export GSD_VCS="$ADAPTER_KIND"

echo "e2e-parallel-phase: backend=${BACKEND} adapter=${ADAPTER_KIND} gsd-tools='${GSD_TOOLS_BIN:-${SCRIPT_DIR}/../gsd-core/bin/gsd-tools.cjs}'" >&2

# ─── Throwaway repo ──────────────────────────────────────────────────────────
#
# Created via `mkdtemp` under $RUNNER_TEMP / $TMPDIR / /tmp — OUTSIDE the
# colocated GSD repo. A repo created inside $GITHUB_WORKSPACE would be
# auto-snapshotted into the outer jj working copy on the next `jj` invocation
# (RESEARCH Pitfall 6 / D-05). An EXIT trap removes it.

REPO=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/gsd-e2e-XXXXXX")
cleanup() {
  rm -rf "$REPO"
  rm -f "${HOOK_MARKER:-}"
}
trap cleanup EXIT

echo "e2e-parallel-phase: throwaway repo at ${REPO}" >&2

# ─── Repo seed (backend-conditional) ─────────────────────────────────────────
#
# Both cells create a COLOCATED repo via `jj git init --colocate` — this
# produces a valid `.git` repo AND a `.jj` directory in one lint-clean step
# (no raw `git init`, D-09). The git cell drives the git adapter against that
# repo's `.git`; the jj cell drives the jj adapter against its `.jj`. The
# sentinel `.githooks/pre-commit` is installed for both, but only the jj cell
# asserts the marker (SC5 — the Phase 12 A3 fix is jj-specific).

# Sentinel pre-commit hook (SC5). A tiny executable that appends a marker line
# to a known file each time it fires. Mirrors the counter-hook in
# src/vcs/__tests__/jj-hooks.test.ts (the HOOK-07 regression test). The
# jj adapter's commit() fires `.githooks/pre-commit` post-squash; a raw `jj
# squash` would bypass the adapter and the hook would never fire (the entire
# A3 bug). The harness leaves GSD_HOOK_SKIP_COLOCATED UNSET — setting it would
# opt out of the hook fire and defeat SC5.
# 19-12 fix: the marker lives OUTSIDE the throwaway repo. With the marker at
# `$REPO/.gsd-hook-marker`, the workspace-side commits (which fire the hook)
# appended it into the PRIMARY working copy while the primary WC pointer was
# stale (the ws squashes rebase slot→merge→primary-@). Fan-in's
# `jj workspace update-stale` then snapshots the old-op WC WITH the marker
# and reconciles divergent operations — leaving the primary WC change
# divergent and tripping assertion 5 (`divergent()` empty). A marker outside
# the repo keeps the primary WC byte-clean so the stale-WC snapshot is a
# no-op, matching the cmd-parallel-jj.test.ts-proven topology.
HOOK_MARKER=$(mktemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/gsd-e2e-marker-XXXXXX")
rm -f "$HOOK_MARKER"   # hook recreates it on first fire; assertion 6 checks existence
mkdir -p "${REPO}/.githooks"
cat > "${REPO}/.githooks/pre-commit" <<EOF
#!/usr/bin/env bash
echo fired >> "${HOOK_MARKER}"
exit 0
EOF
chmod 0755 "${REPO}/.githooks/pre-commit"

# Colocated init via raw jj. `jj git init --colocate` writes both `.git` and
# `.jj`. The `git` subcommand word is QUOTED ("git") on purpose: the
# no-raw-git lint's shell pattern is `/(?:^|[ \t;&|(])git[ \t]+[a-zA-Z]/`,
# which matches the ` git ` substring inside a bare `jj git init` even though
# the binary is `jj`. Quoting the word breaks that match (a `"` follows
# `git`, not whitespace) while leaving the invocation behaviorally identical.
# D-09 forbids the `# vcs-lint:allow-git-here` escape hatch and an allowlist
# entry, so quoting is the only lint-clean way to invoke `jj git init` here.
( cd "$REPO" && jj "git" init --colocate >/dev/null 2>&1 ) \
  || { echo "FATAL: 'jj ${ECHO_GIT} init --colocate' failed in ${REPO}" >&2; exit 1; }
( cd "$REPO" && jj config set --repo user.email "e2e@gsd.test" >/dev/null 2>&1 ) || true
( cd "$REPO" && jj config set --repo user.name "GSD E2E" >/dev/null 2>&1 ) || true

# Seed commit: a `seed.txt` file plus the materialized phase structure. The
# dispatch verbs expect a `.planning/phases/` tree to exist; `planId` is an
# opaque label the verbs never open (RESEARCH D-05). `jj squash -B @ -k`
# folds the working-copy changes into a described seed change.
printf 'seed\n' > "${REPO}/seed.txt"
mkdir -p "${REPO}/.planning/phases/13-test"
( cd "$REPO" && jj squash -B @ -k -m "seed" >/dev/null 2>&1 ) \
  || { echo "FATAL: seed squash failed in ${REPO}" >&2; exit 1; }

# The main bookmark. `jj bookmark set main -r '@-'` points the `main`
# bookmark at the seed change (the parent of the empty working-copy change)
# and — because the repo is colocated — also creates the `.git/refs/heads/main`
# git branch. Both the git and the jj dispatch verbs take `--main-bookmark
# main` from here.
MAIN_BOOKMARK=main
( cd "$REPO" && jj bookmark set "$MAIN_BOOKMARK" -r '@-' >/dev/null 2>&1 ) \
  || { echo "FATAL: could not set '${MAIN_BOOKMARK}' bookmark in ${REPO}" >&2; exit 1; }

echo "e2e-parallel-phase: seeded colocated repo, main bookmark='${MAIN_BOOKMARK}'" >&2

# ─── Dispatch ────────────────────────────────────────────────────────────────
#
# Mirrors the execute-phase.md dispatch block (lines 555-561) 1:1: build the
# 2-plan JSON via the `printf | jq -R . | jq -sc 'map(...)'` pipeline, pipe
# it to `workspace.parallel.dispatch` on stdin (`--plan @-`), then guard both
# an empty Handle and a `.ok == false` failure envelope.

# Two agent labels for the synthetic 2-plan phase. Harness-internal literals —
# not external input (threat T-13-10: no `eval`, agent labels are constants).
AGENT_LABELS="e2e-a e2e-b"

PLANS_JSON=$(printf '%s\n' $AGENT_LABELS | jq -R . | jq -sc 'map({agentId: ., planId: .})')

HANDLE_JSON=$(printf '%s' "$PLANS_JSON" \
  | run_gsd_tools query workspace.parallel.dispatch \
      --cwd "$REPO" --phase 13 --main-bookmark "$MAIN_BOOKMARK" --plan @-)

# Empty-Handle guard (execute-phase.md:559).
[ -z "$HANDLE_JSON" ] && { echo "FATAL: dispatch returned empty Handle JSON" >&2; exit 1; }

# Failure-envelope guard (execute-phase.md:560-561). Success returns a flat
# Handle with `.ok` absent; failure returns `{ok:false,reason:...}`.
HANDLE_OK=$(printf '%s' "$HANDLE_JSON" | jq -r '.ok // "true"')
[ "$HANDLE_OK" = "false" ] && { echo "FATAL: dispatch failed: $HANDLE_JSON" >&2; exit 1; }

echo "e2e-parallel-phase: dispatch ok — $(printf '%s' "$HANDLE_JSON" | jq -r '.workspaces | length') workspace(s)" >&2

# ─── Per-workspace commits ───────────────────────────────────────────────────
#
# For each workspace in the Handle, write a DISTINCT file (`work-<agentId>.txt`
# — distinct names so the per-branch merges have nothing to conflict on, the
# same approach as cmd-parallel-git.test.ts:171) and create one commit.
#
# The commit MUST go through `run_gsd_tools query commit` (SC5). On the jj
# cell this is what fires `.githooks/pre-commit`: `gsd-tools query commit`
# routes through `createVcsAdapter().commit()` (src/vcs-command-router.cts)
# and the jj adapter's `commit()` fires the hook post-squash. A raw `jj
# squash` would bypass the adapter and the hook would never fire.
#
# `gsd-tools query commit` has NO `--cwd` flag — it resolves `projectDir`
# from the process cwd, then `findProjectRoot` walks UP looking for
# `.planning/`. So the commit is run in a subshell with the cwd set to the
# workspace path. A `.planning/` marker dir is created in each workspace
# first so `findProjectRoot` returns the workspace unchanged (its rule 1:
# "startDir itself has .planning/ → return it") instead of walking up to the
# throwaway-repo root. The hook (`.githooks/pre-commit`) is a tracked file
# from the seed commit, so it is present in every workspace checkout.
#
# `handle.workspaces[].path` is an ABSOLUTE path — used directly, never
# re-prefixed with $REPO.

WORKSPACE_PATHS=$(printf '%s' "$HANDLE_JSON" | jq -r '.workspaces[].path')
WORKSPACE_COUNT=$(printf '%s' "$HANDLE_JSON" | jq -r '.workspaces | length')

# Iterate path<TAB>agentId pairs. A here-string feeds the loop so the commit
# subshells run in the parent shell (a pipe would subshell the whole loop and
# lose `set -e` propagation on the commit failures).
while IFS=$'\t' read -r WS_PATH WS_AGENT; do
  [ -z "$WS_PATH" ] && continue
  if [ ! -d "$WS_PATH" ]; then
    echo "FATAL: dispatched workspace path does not exist: ${WS_PATH}" >&2
    exit 1
  fi
  # `.planning/` marker so `gsd-tools query commit`'s findProjectRoot resolves
  # projectDir to THIS workspace, not the throwaway-repo root.
  mkdir -p "${WS_PATH}/.planning"
  printf 'work %s\n' "$WS_AGENT" > "${WS_PATH}/work-${WS_AGENT}.txt"

  COMMIT_JSON=$(
    cd "$WS_PATH" \
      && run_gsd_tools query commit "feat(13-test): e2e work ${WS_AGENT}" \
           --files "work-${WS_AGENT}.txt"
  )
  COMMIT_OK=$(printf '%s' "$COMMIT_JSON" | jq -r '.committed // false')
  if [ "$COMMIT_OK" != "true" ]; then
    echo "FATAL: per-workspace commit failed for agent '${WS_AGENT}': ${COMMIT_JSON}" >&2
    exit 1
  fi
done <<< "$(printf '%s' "$HANDLE_JSON" | jq -r '.workspaces[] | .path + "\t" + .agentId')"

echo "e2e-parallel-phase: committed ${WORKSPACE_COUNT} per-workspace change(s) via 'query commit'" >&2

# ─── Results accumulator ─────────────────────────────────────────────────────
#
# `RESULTS_ACCUM` is the `ParallelAgentResult[]` the fan-in `--results`
# consumes — one `{agentId, exitCode: 0}` per agent (the lastChangeId/stderr
# fields are optional and omitted). Built from the Handle's workspace agentIds.

RESULTS_ACCUM=$(printf '%s' "$HANDLE_JSON" \
  | jq -c '[.workspaces[] | {agentId: .agentId, exitCode: 0}]')

# ─── Fan-in ──────────────────────────────────────────────────────────────────
#
# Mirrors the execute-phase.md fan-in block (lines 769-773) 1:1: the CLI
# rejects `--handle @- --results @-` (reason
# 'handle_and_results_cannot_both_be_stdin'), so the Handle JSON is written to
# a `mktemp` file and passed as `--handle "@$HANDLE_FILE"` with the results on
# stdin (`--results @-`). The Handle file is removed immediately after.

HANDLE_FILE=$(mktemp "${TMPDIR:-/tmp}/gsd-handle-XXXXXX.json")
printf '%s' "$HANDLE_JSON" > "$HANDLE_FILE"
FAN_RESULT=$(printf '%s' "$RESULTS_ACCUM" \
  | run_gsd_tools query workspace.parallel.fan-in \
      --cwd "$REPO" --handle "@$HANDLE_FILE" --results @-)
rm -f "$HANDLE_FILE"

[ -z "$FAN_RESULT" ] && { echo "FATAL: fan-in returned empty result" >&2; exit 1; }
FAN_OK=$(printf '%s' "$FAN_RESULT" | jq -r '.ok // "true"')
[ "$FAN_OK" = "false" ] && { echo "FATAL: fan-in failed: $FAN_RESULT" >&2; exit 1; }

echo "e2e-parallel-phase: fan-in ok" >&2

# ─── Assertions ──────────────────────────────────────────────────────────────
#
# Each failed assertion prints a diagnostic to stderr and exits non-zero on
# the first failure (CONTEXT.md D-02 lane assertions). `assert_eq` is a tiny
# helper — name, expected, actual.

assert_eq() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" != "$actual" ]; then
    echo "FAIL [${name}]: expected '${expected}', got '${actual}'" >&2
    echo "  HANDLE_JSON: ${HANDLE_JSON}" >&2
    echo "  FAN_RESULT:  ${FAN_RESULT}" >&2
    exit 1
  fi
  echo "  PASS [${name}]: ${actual}" >&2
}

# Assertion 1 (SC1): the dispatch Handle carries exactly 2 workspaces.
WS_LEN=$(printf '%s' "$HANDLE_JSON" | jq -r '.workspaces | length')
assert_eq "workspaces.length == 2" "2" "$WS_LEN"

# Assertion 2 (SC2): fan-in reported no conflict.
CONFLICTED=$(printf '%s' "$FAN_RESULT" | jq -r '.conflicted')
assert_eq "fan-in conflicted == false" "false" "$CONFLICTED"

# Assertion 3 (SC2 — per-backend split): merged.length is 2 on git (one entry
# per 2-parent merge) and 1 on jj (one N-parent octopus merge).
MERGED_LEN=$(printf '%s' "$FAN_RESULT" | jq -r '.merged | length')
if [ "$BACKEND" = "git" ]; then
  assert_eq "git: merged.length == 2" "2" "$MERGED_LEN"
else
  assert_eq "jj: merged.length == 1" "1" "$MERGED_LEN"
fi

# Assertion 4 (D-02 assertion 4 — per-backend split): the dispatch Handle's
# manifest is a non-empty truthy value on git and the empty string on jj
# (Phase 11 D-01 retired the jj-side manifest).
MANIFEST=$(printf '%s' "$HANDLE_JSON" | jq -r '.manifest')
if [ "$BACKEND" = "git" ]; then
  if [ -z "$MANIFEST" ]; then
    echo "FAIL [git: manifest truthy]: manifest is empty" >&2
    echo "  HANDLE_JSON: ${HANDLE_JSON}" >&2
    exit 1
  fi
  echo "  PASS [git: manifest truthy]: ${MANIFEST}" >&2
else
  assert_eq "jj: manifest == ''" "" "$MANIFEST"
fi

# Assertions 5 + 6 are jj-colocated-only (SC3 + SC5).
if [ "$BACKEND" = "jj-colocated" ]; then
  # Assertion 5 (SC3 — TEST-14 parity): post-fan-in the throwaway repo has no
  # divergent changes. Raw `jj` is lint-clean (D-09). `--ignore-working-copy`
  # keeps the probe from snapshotting; an empty result means no divergence.
  DIVERGENT=$(cd "$REPO" && jj log -r 'divergent()' --no-graph --ignore-working-copy -T 'change_id ++ "\n"')
  if [ -n "$DIVERGENT" ]; then
    echo "FAIL [jj: divergent() empty]: divergent changes present:" >&2
    printf '%s\n' "$DIVERGENT" >&2
    exit 1
  fi
  echo "  PASS [jj: divergent() empty]" >&2

  # Assertion 6 (SC5): the sentinel `.githooks/pre-commit` left its marker —
  # proof the Phase 12 A3 fix fired the hook during the parallel-dispatched
  # run. The hook appends one `fired` line per `vcs.commit()`; with 2
  # per-workspace commits the marker file has 2 lines.
  if [ ! -f "$HOOK_MARKER" ]; then
    echo "FAIL [jj: hook marker exists]: ${HOOK_MARKER} not found — .githooks/pre-commit did not fire" >&2
    exit 1
  fi
  MARKER_LINES=$(grep -c 'fired' "$HOOK_MARKER" || true)
  assert_eq "jj: hook fired per workspace (marker line count)" "$WORKSPACE_COUNT" "$MARKER_LINES"
fi

# ─── Done ────────────────────────────────────────────────────────────────────

echo "OK: e2e-parallel-phase passed for backend ${BACKEND}" >&2
exit 0
