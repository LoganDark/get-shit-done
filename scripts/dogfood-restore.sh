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
# Pre-condition: must be run from the project root.
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
CLEANUP_JSON=$(gsd-sdk query cleanup-subagent-workspaces --all-phases 2>&1 \
	|| { echo "WARN: orphan cleanup failed" >&2; echo '{"abandoned":[],"failedReaped":[]}'; })
ABANDONED_COUNT=$(echo "$CLEANUP_JSON" | jq -r '.abandoned | length' 2>/dev/null || echo "?")
FAILED_COUNT=$(echo "$CLEANUP_JSON" | jq -r '.failedReaped | length' 2>/dev/null || echo "?")
echo "dogfood-restore: orphan-workspace cleanup complete (abandoned=${ABANDONED_COUNT}, failedReaped=${FAILED_COUNT})" >&2
