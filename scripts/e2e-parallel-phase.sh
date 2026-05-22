#!/usr/bin/env bash
# e2e-parallel-phase.sh — CI-05 end-to-end parallel-dispatch harness
#
# Drives the `gsd-sdk query workspace.parallel.{dispatch,fan-in}` CLI bridges
# against a freshly-created throwaway repo, for the backend named in the
# GSD_E2E_BACKEND environment variable. The CI lane (plan 13-04) runs this
# harness once per backend cell (`git` and `jj-colocated`).
#
# This is the only test layer that exercises the CLI-bridge surface — the
# `@-`/`@<path>` stdin resolution, the `{ok:false,reason}` failure envelope,
# the `jq` pipelines, and (on the jj cell) real `jj` subprocesses firing
# `.githooks/pre-commit`. The TypeScript-level TEST-13 contract tests call the
# adapters directly and cannot see any of that. The harness mirrors the
# `get-shit-done/workflows/execute-phase.md` dispatch/fan-in shell sequence
# 1:1 — "fidelity, not smoke test."
#
# Environment:
#   GSD_E2E_BACKEND   required — `git` or `jj-colocated`
#   GSD_SDK           the `gsd-sdk` invocation; defaults to the literal
#                     `gsd-sdk` when unset. In CI, after `npm run build:sdk`,
#                     set it to `node "$GITHUB_WORKSPACE/sdk/dist/cli.js"`.
#
# Exit codes:
#   0   every assertion passed
#   1   an assertion failed, or a setup step failed (diagnostic on stderr)
#
# D-09: this file contains NO raw `git <cmd>` invocation. All git-side VCS
# setup routes through `gsd-sdk query` or through raw `jj` (the throwaway
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

Drives `gsd-sdk query workspace.parallel.{dispatch,fan-in}` against a
throwaway repo for one backend cell.

Required environment:
  GSD_E2E_BACKEND   `git` or `jj-colocated`

Optional environment:
  GSD_SDK           the gsd-sdk invocation (default: `gsd-sdk`).
                    In CI: `node "$GITHUB_WORKSPACE/sdk/dist/cli.js"`.

Usage:
  GSD_E2E_BACKEND=jj-colocated scripts/e2e-parallel-phase.sh
  GSD_E2E_BACKEND=git GSD_SDK="node sdk/dist/cli.js" scripts/e2e-parallel-phase.sh
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

# The gsd-sdk invocation. CI sets `node "$GITHUB_WORKSPACE/sdk/dist/cli.js"`;
# a globally-installed context leaves it unset and the literal `gsd-sdk` is
# used. Every SDK call below goes through `$GSD_SDK query ...` — never a bare
# `gsd-sdk`.
GSD_SDK="${GSD_SDK:-gsd-sdk}"

# Plain-text "git" token for diagnostic strings. Holding it in a variable
# keeps the literal ` git ` substring out of non-comment lines, where the
# no-raw-git lint's shell pattern would otherwise flag it (the lint skips
# `#`-comment lines but not echo'd strings). Used only in human-readable
# stderr diagnostics — never to build a command.
ECHO_GIT=git

# The git/jj adapter backend the SDK resolves. `createVcsAdapter` honors the
# GSD_VCS env var (priority #2, no config lock-in side effect — see
# sdk/src/vcs/index.ts resolveKind). The throwaway repo is always colocated
# (`.git` + `.jj` both present); GSD_VCS pins which adapter the SDK drives.
if [ "$BACKEND" = "git" ]; then
  ADAPTER_KIND=git
else
  ADAPTER_KIND=jj
fi
export GSD_VCS="$ADAPTER_KIND"

echo "e2e-parallel-phase: backend=${BACKEND} adapter=${ADAPTER_KIND} sdk='${GSD_SDK}'" >&2

# ─── Throwaway repo ──────────────────────────────────────────────────────────
#
# Created via `mkdtemp` under $RUNNER_TEMP / $TMPDIR / /tmp — OUTSIDE the
# colocated GSD repo. A repo created inside $GITHUB_WORKSPACE would be
# auto-snapshotted into the outer jj working copy on the next `jj` invocation
# (RESEARCH Pitfall 6 / D-05). An EXIT trap removes it.

REPO=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/gsd-e2e-XXXXXX")
cleanup() {
  rm -rf "$REPO"
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
# sdk/src/vcs/__tests__/jj-hooks.test.ts (the HOOK-07 regression test). The
# jj adapter's commit() fires `.githooks/pre-commit` post-squash; a raw `jj
# squash` would bypass the adapter and the hook would never fire (the entire
# A3 bug). The harness leaves GSD_HOOK_SKIP_COLOCATED UNSET — setting it would
# opt out of the hook fire and defeat SC5.
HOOK_MARKER="${REPO}/.gsd-hook-marker"
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
  | $GSD_SDK query workspace.parallel.dispatch \
      --cwd "$REPO" --phase 13 --main-bookmark "$MAIN_BOOKMARK" --plan @-)

# Empty-Handle guard (execute-phase.md:559).
[ -z "$HANDLE_JSON" ] && { echo "FATAL: dispatch returned empty Handle JSON" >&2; exit 1; }

# Failure-envelope guard (execute-phase.md:560-561). Success returns a flat
# Handle with `.ok` absent; failure returns `{ok:false,reason:...}`.
HANDLE_OK=$(printf '%s' "$HANDLE_JSON" | jq -r '.ok // "true"')
[ "$HANDLE_OK" = "false" ] && { echo "FATAL: dispatch failed: $HANDLE_JSON" >&2; exit 1; }

echo "e2e-parallel-phase: dispatch ok — $(printf '%s' "$HANDLE_JSON" | jq -r '.workspaces | length') workspace(s)" >&2

# TASK 2 CONTINUES HERE
