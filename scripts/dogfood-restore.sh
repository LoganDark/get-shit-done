#!/usr/bin/env bash
# dogfood-restore.sh — recovery primitive for the Phase 14 dogfood snapshot.
#
# Restores this repo to the state captured by scripts/dogfood-phase-14.sh's
# pre-snapshot step. Two positional arguments:
#
#   <pre-op-id>      Full jj op-id captured pre-dogfood, persisted into the
#                    durable Recovery Anchor section of
#                    .planning/intel/v1.3-dogfood-metrics.md.
#   <tarball-path>   Absolute path to planning.tar in the sibling-mktemp
#                    pre-snapshot dir (e.g. /tmp/gsd-dogfood-pre-XXXX/planning.tar).
#
# Ordering rationale (see Pitfall 2 in 14-RESEARCH.md): the jj op-restore
# step runs FIRST so jj's working-copy update happens before tar repopulates
# .planning/. The tar extract runs LAST so the tarball's content is the
# authoritative final state — the op-restore step's WC update cannot
# clobber it.
#
# Restore scope (see RESEARCH finding #3 / §D): we pass NO restore-scope
# flag, so jj 0.41 falls back to its built-in conservative default (repo
# state plus remote-tracking refs) — exactly what this recovery wants.
# CONTEXT D-10 considered narrowing the scope; RESEARCH recommended omitting,
# and Plan 14-04's rehearsal validates the choice empirically.
#
# Pre-condition: must be run from the project root. Enforced (Phase 18
# CLEANUP-03 / Phase 14 WR-01): the assertion below the positional parse
# exits 1 before the tarball check and before either mutation (jj op
# restore, tar -xf) when .planning/STATE.md is absent from the cwd.
#
# Exit 0 on success; exit 1 on any failure (with diagnostic on stderr).

set -euo pipefail

if [ "$#" -ne 2 ]; then
	cat >&2 <<EOF
dogfood-restore.sh — recovery primitive for Phase 14 dogfood snapshot.

Usage: $0 <pre-op-id> <tarball-path>

  <pre-op-id>      Full jj op-id captured into v1.3-dogfood-metrics.md by the
                   pre-snapshot step of scripts/dogfood-phase-14.sh.
  <tarball-path>   Absolute path to planning.tar in the sibling-mktemp pre-
                   snapshot dir.

This script must be run from the project root.
EOF
	exit 1
fi

PRE_OP_ID="$1"
TARBALL_PATH="$2"

# Phase 18 (CLEANUP-03 / Phase 14 WR-01): project-root assertion. Must fire
# BEFORE the tarball-existence check and both mutations (jj op restore,
# tar -xf -C .) — a wrong-cwd run aborts here, pre-mutation.
[ -f .planning/STATE.md ] || { echo "ERROR: dogfood-restore.sh must run from project root" >&2; exit 1; }

# Phase 19 (19-11): the fork `gsd-sdk` CLI retired with the SDK (upstream
# ADR-0174); the cleanup verb dispatches through the PORT-02 bridge at
# gsd-core/bin/gsd-tools.cjs. Default resolution is script-relative (this
# script lives in scripts/, the bridge in ../gsd-core/bin/). GSD_TOOLS_BIN
# lets tests inject an executable shim (PATH-shim parity with the retired
# gsd-sdk lookup) without touching the production resolution.
SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
run_gsd_tools() {
	if [ -n "${GSD_TOOLS_BIN:-}" ]; then
		"$GSD_TOOLS_BIN" "$@"
	else
		node "${SCRIPT_DIR}/../gsd-core/bin/gsd-tools.cjs" "$@"
	fi
}

if [ ! -f "$TARBALL_PATH" ]; then
	echo "FATAL: tarball not found: ${TARBALL_PATH}" >&2
	exit 1
fi

echo "dogfood-restore: restoring op-id ${PRE_OP_ID}" >&2
jj op restore "$PRE_OP_ID"

echo "dogfood-restore: extracting ${TARBALL_PATH}" >&2
tar -xf "$TARBALL_PATH" -C .

echo "dogfood-restore: complete. Verify with: jj diff --summary && jj log -r '@-..@' --no-graph" >&2

# Phase 16.02 (CLEANUP-02 / D-11/D-12/D-13): post-restore orphan-workspace
# cleanup. Idempotent — re-invoking on a clean tree returns
# {abandoned:[], failedReaped:[]}. Trap with WARN so a cleanup-only miss
# does NOT flag "restore failed" (op-restore + tar both succeeded).
#
# Phase 16 REVIEW CR-02 fix: stdout and stderr are captured SEPARATELY so
# jq only ever parses pristine JSON. Prior `2>&1`-into-CLEANUP_JSON form
# corrupted the JSON payload as soon as the CLI emitted ANY stderr noise
# (historically the retired gsd-sdk wrapper's "not in native registry;
# falling back to gsd-tools.cjs" warning, documented in
# tests/cli-cleanup-subagent-workspaces.test.cjs) — concatenated
# warning+JSON failed jq parse, both counts silently flipped to "?", and
# the WARN trap never fired because the CLI exit code was still 0.
#
# Note on `set -e` interaction (Phase 16 REVIEW IN-01): `set -e` is in
# effect from line 29. The if/else form below makes the CLI exit
# code observable to the script without tripping `set -e`'s
# unguarded-failure trap — `if cmd` is `set -e`-safe.
CLEANUP_STDERR_FILE=$(mktemp -t dogfood-restore-cleanup-stderr.XXXXXX)
if CLEANUP_JSON=$(run_gsd_tools query cleanup-subagent-workspaces --all-phases 2>"$CLEANUP_STDERR_FILE"); then
	:
else
	echo "WARN: orphan cleanup failed (stderr follows):" >&2
	cat "$CLEANUP_STDERR_FILE" >&2
	CLEANUP_JSON='{"abandoned":[],"failedReaped":[]}'
fi
rm -f "$CLEANUP_STDERR_FILE"

# Phase 16 REVIEW WR-04 fix: promote the bare `|| echo "?"` parse-failure
# fallback to an explicit WARN so the user can distinguish a clean run
# (counts are real integers) from a parse-failure run (counts are "?").
# Pre-fix, the diagnostic on the final line always said "complete
# (abandoned=N, failedReaped=M)" even when one or both counts had fallen
# back to "?", obscuring the failure mode. After this fix, the only path
# to "?" is jq absent or jq-rejected stdin — both deserve a WARN.
if ! ABANDONED_COUNT=$(printf '%s' "$CLEANUP_JSON" | jq -r '.abandoned | length' 2>/dev/null); then
	echo "WARN: jq failed to parse cleanup JSON for .abandoned count (jq missing or invalid JSON?)" >&2
	ABANDONED_COUNT="?"
fi
if ! FAILED_COUNT=$(printf '%s' "$CLEANUP_JSON" | jq -r '.failedReaped | length' 2>/dev/null); then
	echo "WARN: jq failed to parse cleanup JSON for .failedReaped count (jq missing or invalid JSON?)" >&2
	FAILED_COUNT="?"
fi
echo "dogfood-restore: orphan-workspace cleanup complete (abandoned=${ABANDONED_COUNT}, failedReaped=${FAILED_COUNT})" >&2
