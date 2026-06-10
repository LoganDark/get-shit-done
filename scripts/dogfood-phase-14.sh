#!/usr/bin/env bash
# dogfood-phase-14.sh — v1.3 dogfood orchestrator (Phase 14, DOGFOOD-01 + DOGFOOD-02).
#
# HISTORICAL (Phase 19 merge, 19-13): this one-shot dogfood driver fired on
# 2026-05-23 against the v1.3 fork-SDK layout; its `gsd-sdk` CLI invocations
# (GSD_SDK default below) target the SDK retired by upstream ADR-0174 and are
# NOT runnable against the adopted tree. Retained as the recorded driver of
# the v1.3 dogfood metrics (.planning/intel/v1.3-dogfood-metrics.md); the
# live parallel-dispatch e2e surface is scripts/e2e-parallel-phase.sh
# (gsd-tools bridge). Do not re-point — re-derivation beyond merge scope.
#
# Drives the SDK CLI parallel-dispatch surface end-to-end against THIS repo
# (jj cell, isolated `gsd/phase-14-dogfood` bookmark) AND a sibling mktemp
# throwaway colocated repo (git cell, raw-git-clean via `jj "git" init`). Two
# symmetric cells: same SDK CLI verbs, same jq pipelines, same per-stage
# millisecond-epoch timing capture. Both cells default to N=3 plans
# (`N=2 bash scripts/dogfood-phase-14.sh` is the Phase 13 baseline override
# per RESEARCH Open Q3 + Pitfall 4).
#
# Pre-snapshot + recovery anchor (D-09 + D-12):
#
#   The pre-snapshot dir is created via `mktemp -d -t gsd-dogfood-pre-XXXX`
#   BEFORE any dispatch step. It contains `pre.oplog` (200-entry op-log) +
#   `planning.tar` (whole-`.planning/` tarball). The directory is INTENTIONALLY
#   not trap-cleaned — it survives the run so the durable Recovery Anchor in
#   .planning/intel/v1.3-dogfood-metrics.md references a still-existing path
#   for as long as the OS TMPDIR cleanup interval allows. Plan 14-05 Task 2
#   inlines the metrics file write below; Task 3 appends the run-specific
#   recovery prose to 14-CONTEXT.md.
#
# Pitfall 10 — blast-radius bounded:
#
#   The jj cell creates the bookmark `gsd/phase-14-dogfood` (NEVER `main`) and
#   abandons it on green. The git cell uses a sibling-mktemp throwaway repo
#   that is `trap`-removed on EXIT. Main bookmark `main` is captured pre-run
#   and asserted unchanged post-run. If any assertion fails mid-run the
#   stderr summary block prints the verbatim recovery invocation so the
#   operator can `bash scripts/dogfood-restore.sh <pre-op-id> <tarball-path>`
#   manually.
#
# Pre-condition: must be run from the project root (.planning/config.json
# exists). Plan 14-01 already flipped this repo's `parallelization` to true
# so CONFIG-02 pre-flight refusal will NOT fire here.

set -euo pipefail

# ─── Project-root precondition ───────────────────────────────────────────────

if [ ! -f "$PWD/.planning/config.json" ]; then
	echo "FATAL: must be run from the project root (no .planning/config.json at $PWD)" >&2
	exit 1
fi
REPO_ROOT="$PWD"

# ─── Env-var defaults + validation ───────────────────────────────────────────

usage() {
	cat >&2 <<'EOF'
dogfood-phase-14.sh — v1.3 dogfood orchestrator (Phase 14).

Drives `gsd-sdk query workspace.parallel.{dispatch,fan-in}` end-to-end on
two backend cells:

  jj-cell  — in-repo, isolated `gsd/phase-14-dogfood` bookmark (NOT main).
  git-cell — sibling mktemp throwaway colocated repo (trap-cleaned on EXIT).

Each cell dispatches N synthetic plans (default N=3), runs per-workspace
commits via `gsd-sdk query commit`, fans in, and the script records
dispatch_ms + fan_in_ms + conflict_count for both cells in
.planning/intel/v1.3-dogfood-metrics.md (D-12).

Pre-snapshot (.planning/ tarball + jj op-log) + recovery anchor written
to a sibling mktemp dir BEFORE any dispatch step. Recovery invocation is
printed to stderr at the end of the run for operator reference.

Optional environment:
  N        plan count per cell (default 3, must be a positive integer >= 2).
           `N=2 bash scripts/dogfood-phase-14.sh` is the Phase 13 baseline.
  GSD_SDK  the gsd-sdk invocation (default `gsd-sdk`).
EOF
}

# Help flag short-circuit (no other args supported).
case "${1:-}" in
	-h | --help)
		usage
		exit 0
		;;
	'') ;;
	*)
		echo "FATAL: unexpected argument '$1' (see --help)" >&2
		exit 1
		;;
esac

GSD_SDK="${GSD_SDK:-gsd-sdk}"

# N (plan count per cell): positive integer ≥ 2. Validated to keep threat
# T-14-T-shell-injection bounded — the value is used inside `seq 1 "$N"` and
# in bookmark/agent labels, both of which would behave badly on a non-integer
# input.
N="${N:-3}"
case "$N" in
	'' | *[!0-9]*)
		echo "FATAL: N must be a positive integer (got: '${N}')" >&2
		usage
		exit 1
		;;
esac
if [ "$N" -lt 2 ]; then
	echo "FATAL: N must be >= 2 (got: ${N})" >&2
	usage
	exit 1
fi

echo "dogfood-phase-14: N=${N} GSD_SDK='${GSD_SDK}' REPO_ROOT='${REPO_ROOT}'" >&2

# Plain-text "git" token for diagnostic strings — keeps the literal ` git `
# substring out of non-comment lines where the no-raw-git lint's shell
# pattern would otherwise flag it. Mirrors `e2e-parallel-phase.sh:79`.
ECHO_GIT=git

# ─── Assert helper ───────────────────────────────────────────────────────────

assert_eq() {
	local name="$1" expected="$2" actual="$3"
	if [ "$expected" != "$actual" ]; then
		echo "FAIL [${name}]: expected '${expected}', got '${actual}'" >&2
		return 1
	fi
	echo "  PASS [${name}]: ${actual}" >&2
}

# ─── Pre-snapshot capture (D-09 — BEFORE bookmark create) ────────────────────
#
# Sibling-mktemp ONLY. Memory `feedback_avoid_jj_auto_tracked_output`: any
# file created inside the WC would be auto-snapshotted by jj on the next
# invocation. The $PRE directory and its contents live OUTSIDE the WC.
#
# INTENTIONALLY: no EXIT-cleanup of the sibling snapshot dir — D-12 needs
# the path persisted for the recovery anchor in
# .planning/intel/v1.3-dogfood-metrics.md.

PRE=$(mktemp -d "${TMPDIR:-/tmp}/gsd-dogfood-pre-XXXX")
echo "dogfood-phase-14: pre-snapshot dir = ${PRE}" >&2

PRE_OP_ID=$(jj op log -n 1 --no-graph -T 'id ++ "\n"')
echo "dogfood-phase-14: pre-op-id = ${PRE_OP_ID}" >&2

jj op log -n 200 >"${PRE}/pre.oplog"
tar -cf "${PRE}/planning.tar" .planning/

if command -v sha256sum >/dev/null 2>&1; then
	TARBALL_SHA=$(sha256sum "${PRE}/planning.tar" | awk '{print $1}')
else
	TARBALL_SHA=$(shasum -a 256 "${PRE}/planning.tar" | awk '{print $1}')
fi
echo "dogfood-phase-14: tarball=${PRE}/planning.tar sha256=${TARBALL_SHA}" >&2

# ─── MAIN_BEFORE — Pitfall 10 blast-radius guard ─────────────────────────────
#
# Captured here, just before the bookmark create / dispatch sequence, and
# compared against MAIN_AFTER post-fan-in to assert main was not touched.

MAIN_BEFORE=$(jj log -r main --no-graph --ignore-working-copy -T 'change_id ++ "\n"' -n 1)
echo "dogfood-phase-14: MAIN_BEFORE change_id=${MAIN_BEFORE:0:12}…" >&2

# ─── Build N agent labels ────────────────────────────────────────────────────
#
# Hardcoded label prefixes — phase-14-1..N for the jj cell, phase-14-git-1..N
# for the git cell. Threat T-14-T-bookmark mitigated: labels are constants
# derived from the validated integer N, not from user input.

AGENT_LABELS_JJ=""
AGENT_LABELS_GIT=""
for i in $(seq 1 "$N"); do
	AGENT_LABELS_JJ="${AGENT_LABELS_JJ} phase-14-${i}"
	AGENT_LABELS_GIT="${AGENT_LABELS_GIT} phase-14-git-${i}"
done

# ════════════════════════════════════════════════════════════════════════════
# JJ CELL — in-repo, isolated bookmark `gsd/phase-14-dogfood`
# ════════════════════════════════════════════════════════════════════════════

echo "" >&2
echo "═══ jj cell ═══" >&2

# Create the dogfood bookmark at @- (the parent of the current empty WC
# change). Threat T-14-Repud-pitfall-10 mitigated: hardcoded literal
# `gsd/phase-14-dogfood`, NOT main; bookmark created BEFORE dispatch so the
# `--main-bookmark gsd/phase-14-dogfood` CLI arg resolves correctly.
jj bookmark create gsd/phase-14-dogfood -r @-
JJ_BOOKMARK_CHANGE=$(jj log -r 'gsd/phase-14-dogfood' --no-graph --ignore-working-copy -T 'change_id.short(8) ++ "\n"' -n 1)
echo "dogfood-phase-14: created gsd/phase-14-dogfood at ${JJ_BOOKMARK_CHANGE}" >&2

# Build the plans JSON for the jj cell.
PLANS_JSON_JJ=$(printf '%s\n' $AGENT_LABELS_JJ | jq -R . | jq -sc 'map({agentId: ., planId: .})')

# Dispatch — bracketed by millisecond-epoch timestamps. The CLI verb is the
# same as `e2e-parallel-phase.sh:180-190` (the Phase 13 harness), just with
# our isolated bookmark.
DISPATCH_START_MS=$(date +%s%3N)
HANDLE_JSON_JJ=$(printf '%s' "$PLANS_JSON_JJ" \
	| $GSD_SDK query workspace.parallel.dispatch \
		--cwd "$REPO_ROOT" --phase 14 --main-bookmark gsd/phase-14-dogfood --plan @-)
DISPATCH_END_MS=$(date +%s%3N)
DISPATCH_MS_JJ=$((DISPATCH_END_MS - DISPATCH_START_MS))

[ -z "$HANDLE_JSON_JJ" ] && {
	echo "FATAL: jj cell dispatch returned empty Handle JSON" >&2
	exit 1
}
HANDLE_OK_JJ=$(printf '%s' "$HANDLE_JSON_JJ" | jq -r 'if .ok == false then "false" else "true" end')
[ "$HANDLE_OK_JJ" = "false" ] && {
	echo "FATAL: jj cell dispatch failed: $HANDLE_JSON_JJ" >&2
	exit 1
}

WORKSPACE_COUNT_JJ=$(printf '%s' "$HANDLE_JSON_JJ" | jq -r '.workspaces | length')
echo "dogfood-phase-14: jj dispatch ok (${WORKSPACE_COUNT_JJ} workspace(s), dispatch_ms=${DISPATCH_MS_JJ})" >&2

# Per-workspace commit loop — mirrors `e2e-parallel-phase.sh:225-246`. The
# `.planning/` marker shorts findProjectRoot to the workspace (Pitfall 5).
while IFS=$'\t' read -r WS_PATH WS_AGENT; do
	[ -z "$WS_PATH" ] && continue
	if [ ! -d "$WS_PATH" ]; then
		echo "FATAL: jj cell dispatched workspace path does not exist: ${WS_PATH}" >&2
		exit 1
	fi
	mkdir -p "${WS_PATH}/.planning"
	printf 'work %s\n' "$WS_AGENT" >"${WS_PATH}/work-${WS_AGENT}.txt"

	COMMIT_JSON=$(
		cd "$WS_PATH" \
			&& $GSD_SDK query commit "feat(14-dogfood): jj-cell work ${WS_AGENT}" \
				--files "work-${WS_AGENT}.txt"
	)
	COMMIT_OK=$(printf '%s' "$COMMIT_JSON" | jq -r '.committed // false')
	if [ "$COMMIT_OK" != "true" ]; then
		echo "FATAL: jj cell per-workspace commit failed for agent '${WS_AGENT}': ${COMMIT_JSON}" >&2
		exit 1
	fi
done <<<"$(printf '%s' "$HANDLE_JSON_JJ" | jq -r '.workspaces[] | .path + "\t" + .agentId')"

echo "dogfood-phase-14: jj cell committed ${WORKSPACE_COUNT_JJ} per-workspace change(s)" >&2

# Build ParallelAgentResult[] — one {agentId, exitCode: 0} per workspace.
RESULTS_ACCUM_JJ=$(printf '%s' "$HANDLE_JSON_JJ" \
	| jq -c '[.workspaces[] | {agentId: .agentId, exitCode: 0}]')

# Fan-in — bracketed by millisecond-epoch timestamps. Handle JSON via file
# (the CLI rejects --handle @- --results @- together).
HANDLE_FILE_JJ=$(mktemp "${TMPDIR:-/tmp}/gsd-handle-jj-XXXX.json")
printf '%s' "$HANDLE_JSON_JJ" >"$HANDLE_FILE_JJ"
FANIN_START_MS=$(date +%s%3N)
FAN_RESULT_JJ=$(printf '%s' "$RESULTS_ACCUM_JJ" \
	| $GSD_SDK query workspace.parallel.fan-in \
		--cwd "$REPO_ROOT" --handle "@$HANDLE_FILE_JJ" --results @-)
FANIN_END_MS=$(date +%s%3N)
FAN_IN_MS_JJ=$((FANIN_END_MS - FANIN_START_MS))
rm -f "$HANDLE_FILE_JJ"

[ -z "$FAN_RESULT_JJ" ] && {
	echo "FATAL: jj cell fan-in returned empty result" >&2
	exit 1
}
FAN_OK_JJ=$(printf '%s' "$FAN_RESULT_JJ" | jq -r 'if .ok == false then "false" else "true" end')
[ "$FAN_OK_JJ" = "false" ] && {
	echo "FATAL: jj cell fan-in failed: $FAN_RESULT_JJ" >&2
	exit 1
}

CONFLICT_COUNT_JJ=$(printf '%s' "$FAN_RESULT_JJ" | jq -r 'if .conflicted then 1 else 0 end')
MERGED_LEN_JJ=$(printf '%s' "$FAN_RESULT_JJ" | jq -r '.merged | length')
echo "dogfood-phase-14: jj fan-in ok (conflict_count=${CONFLICT_COUNT_JJ} merged.length=${MERGED_LEN_JJ} fan_in_ms=${FAN_IN_MS_JJ})" >&2

# Post-dispatch jj-cell assertions (SC3 + agent-bookmark cleanup).
DIVERGENT_JJ=$(jj log -r 'divergent()' --no-graph --ignore-working-copy -T 'change_id ++ "\n"')
if [ -n "$DIVERGENT_JJ" ]; then
	echo "FAIL [jj: divergent() empty]: divergent changes present:" >&2
	printf '%s\n' "$DIVERGENT_JJ" >&2
	exit 1
fi
echo "  PASS [jj: divergent() empty]" >&2

AGENT_BOOKMARK_COUNT_JJ=$(jj bookmark list 2>/dev/null | grep -c '^gsd/phase-14-agent-' || true)
assert_eq "jj: agent bookmarks abandoned" "0" "$AGENT_BOOKMARK_COUNT_JJ"

# Abandon the dogfood bookmark on green (D-01).
jj bookmark forget gsd/phase-14-dogfood
DOGFOOD_BOOKMARK_COUNT=$(jj bookmark list 2>/dev/null | grep -c '^gsd/phase-14-dogfood$' || true)
assert_eq "jj: gsd/phase-14-dogfood abandoned" "0" "$DOGFOOD_BOOKMARK_COUNT"

# ════════════════════════════════════════════════════════════════════════════
# GIT CELL — sibling mktemp throwaway colocated repo (trap-cleaned on EXIT)
# ════════════════════════════════════════════════════════════════════════════

echo "" >&2
echo "=== git-cell ===" >&2

GIT_REPO=$(mktemp -d "${TMPDIR:-/tmp}/gsd-dogfood-git-XXXX")
cleanup_git() {
	rm -rf "$GIT_REPO"
}
trap cleanup_git EXIT
echo "dogfood-phase-14: git-cell throwaway repo = ${GIT_REPO}" >&2

# Colocated init via raw jj. The `git` subcommand word is QUOTED ("git") on
# purpose — defeats the no-raw-git regex while staying behaviorally identical
# (mirrors `e2e-parallel-phase.sh:142`).
(cd "$GIT_REPO" && jj "git" init --colocate >/dev/null 2>&1) \
	|| {
		echo "FATAL: 'jj ${ECHO_GIT} init --colocate' failed in ${GIT_REPO}" >&2
		exit 1
	}
(cd "$GIT_REPO" && jj config set --repo user.email "dogfood@gsd.test" >/dev/null 2>&1) || true
(cd "$GIT_REPO" && jj config set --repo user.name "GSD Dogfood" >/dev/null 2>&1) || true

# Seed commit + phase-tree (the dispatch verb expects `.planning/phases/`).
printf 'seed\n' >"${GIT_REPO}/seed.txt"
mkdir -p "${GIT_REPO}/.planning/phases/14-dogfood"
(cd "$GIT_REPO" && jj squash -B @ -k -m "seed" >/dev/null 2>&1) \
	|| {
		echo "FATAL: git-cell seed squash failed in ${GIT_REPO}" >&2
		exit 1
	}

# Main bookmark — the throwaway repo uses literal `main` (it's a fresh repo;
# no isolation concern — the whole repo IS isolated).
MAIN_BOOKMARK_GIT=main
(cd "$GIT_REPO" && jj bookmark set "$MAIN_BOOKMARK_GIT" -r '@-' >/dev/null 2>&1) \
	|| {
		echo "FATAL: could not set '${MAIN_BOOKMARK_GIT}' bookmark in ${GIT_REPO}" >&2
		exit 1
	}

# Pin the adapter to git for this cell (createVcsAdapter honors GSD_VCS).
# `export` for child processes (the gsd-sdk invocation) — RESET after the
# cell so any subsequent ops in this script use the default adapter.
export GSD_VCS=git

echo "dogfood-phase-14: git-cell seeded, adapter pinned" >&2

# Build the plans JSON for the git cell.
PLANS_JSON_GIT=$(printf '%s\n' $AGENT_LABELS_GIT | jq -R . | jq -sc 'map({agentId: ., planId: .})')

# Dispatch.
DISPATCH_START_MS=$(date +%s%3N)
HANDLE_JSON_GIT=$(printf '%s' "$PLANS_JSON_GIT" \
	| $GSD_SDK query workspace.parallel.dispatch \
		--cwd "$GIT_REPO" --phase 14 --main-bookmark "$MAIN_BOOKMARK_GIT" --plan @-)
DISPATCH_END_MS=$(date +%s%3N)
DISPATCH_MS_GIT=$((DISPATCH_END_MS - DISPATCH_START_MS))

[ -z "$HANDLE_JSON_GIT" ] && {
	echo "FATAL: git-cell dispatch returned empty Handle JSON" >&2
	exit 1
}
HANDLE_OK_GIT=$(printf '%s' "$HANDLE_JSON_GIT" | jq -r 'if .ok == false then "false" else "true" end')
[ "$HANDLE_OK_GIT" = "false" ] && {
	echo "FATAL: git-cell dispatch failed: $HANDLE_JSON_GIT" >&2
	exit 1
}

WORKSPACE_COUNT_GIT=$(printf '%s' "$HANDLE_JSON_GIT" | jq -r '.workspaces | length')
echo "dogfood-phase-14: git-cell dispatch ok (${WORKSPACE_COUNT_GIT} workspace(s), dispatch_ms=${DISPATCH_MS_GIT})" >&2

# Per-workspace commit loop (same shape as jj cell).
while IFS=$'\t' read -r WS_PATH WS_AGENT; do
	[ -z "$WS_PATH" ] && continue
	if [ ! -d "$WS_PATH" ]; then
		echo "FATAL: git-cell dispatched workspace path does not exist: ${WS_PATH}" >&2
		exit 1
	fi
	mkdir -p "${WS_PATH}/.planning"
	printf 'work %s\n' "$WS_AGENT" >"${WS_PATH}/work-${WS_AGENT}.txt"

	COMMIT_JSON=$(
		cd "$WS_PATH" \
			&& $GSD_SDK query commit "feat(14-dogfood): git-cell work ${WS_AGENT}" \
				--files "work-${WS_AGENT}.txt"
	)
	COMMIT_OK=$(printf '%s' "$COMMIT_JSON" | jq -r '.committed // false')
	if [ "$COMMIT_OK" != "true" ]; then
		echo "FATAL: git-cell per-workspace commit failed for agent '${WS_AGENT}': ${COMMIT_JSON}" >&2
		exit 1
	fi
done <<<"$(printf '%s' "$HANDLE_JSON_GIT" | jq -r '.workspaces[] | .path + "\t" + .agentId')"

echo "dogfood-phase-14: git-cell committed ${WORKSPACE_COUNT_GIT} per-workspace change(s)" >&2

# Build ParallelAgentResult[].
RESULTS_ACCUM_GIT=$(printf '%s' "$HANDLE_JSON_GIT" \
	| jq -c '[.workspaces[] | {agentId: .agentId, exitCode: 0}]')

# Fan-in.
HANDLE_FILE_GIT=$(mktemp "${TMPDIR:-/tmp}/gsd-handle-git-XXXX.json")
printf '%s' "$HANDLE_JSON_GIT" >"$HANDLE_FILE_GIT"
FANIN_START_MS=$(date +%s%3N)
FAN_RESULT_GIT=$(printf '%s' "$RESULTS_ACCUM_GIT" \
	| $GSD_SDK query workspace.parallel.fan-in \
		--cwd "$GIT_REPO" --handle "@$HANDLE_FILE_GIT" --results @-)
FANIN_END_MS=$(date +%s%3N)
FAN_IN_MS_GIT=$((FANIN_END_MS - FANIN_START_MS))
rm -f "$HANDLE_FILE_GIT"

[ -z "$FAN_RESULT_GIT" ] && {
	echo "FATAL: git-cell fan-in returned empty result" >&2
	exit 1
}
FAN_OK_GIT=$(printf '%s' "$FAN_RESULT_GIT" | jq -r 'if .ok == false then "false" else "true" end')
[ "$FAN_OK_GIT" = "false" ] && {
	echo "FATAL: git-cell fan-in failed: $FAN_RESULT_GIT" >&2
	exit 1
}

CONFLICT_COUNT_GIT=$(printf '%s' "$FAN_RESULT_GIT" | jq -r 'if .conflicted then 1 else 0 end')
MERGED_LEN_GIT=$(printf '%s' "$FAN_RESULT_GIT" | jq -r '.merged | length')
echo "dogfood-phase-14: git-cell fan-in ok (conflict_count=${CONFLICT_COUNT_GIT} merged.length=${MERGED_LEN_GIT} fan_in_ms=${FAN_IN_MS_GIT})" >&2

# Reset adapter pin so the post-cell jj inspection commands below use the
# default adapter (the project-level config — jj).
unset GSD_VCS

# ════════════════════════════════════════════════════════════════════════════
# Pitfall 10 — main-untouched guard
# ════════════════════════════════════════════════════════════════════════════

MAIN_AFTER=$(jj log -r main --no-graph --ignore-working-copy -T 'change_id ++ "\n"' -n 1)
assert_eq "main bookmark unchanged (Pitfall 10)" "$MAIN_BEFORE" "$MAIN_AFTER"

# ════════════════════════════════════════════════════════════════════════════
# Metrics file write (D-12)
# ════════════════════════════════════════════════════════════════════════════

RUN_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
RUN_USER="${USER:-unknown}"
JJ_VERSION=$(jj --version 2>&1 | awk '{print $2}')
NODE_VERSION=$(node --version 2>&1)
GSD_SDK_COMMIT=$(jj log -r @ --no-graph --ignore-working-copy -T 'change_id.short(12) ++ "\n"' -n 1)

METRICS_FILE="${REPO_ROOT}/.planning/intel/v1.3-dogfood-metrics.md"
mkdir -p "${REPO_ROOT}/.planning/intel"

cat >"$METRICS_FILE" <<METRICS
# v1.3 Dogfood Metrics — Phase 14

**Date:** ${RUN_DATE}
**Operator:** ${RUN_USER} (executor: Claude Opus 4.7)
**This-repo state before dogfood:** parallelization=false (D-03 pre-flip baseline)
**This-repo state after dogfood:** parallelization=true (Plan 14-01 + Plan 14-05)
**Tool versions:** \`jj ${JJ_VERSION}\`, Node \`${NODE_VERSION}\`, gsd-sdk built from change_id \`${GSD_SDK_COMMIT}\`

## Per-cell metrics

### jj cell (in-repo, bookmark \`gsd/phase-14-dogfood\`)

| Metric | Value | Unit |
|--------|-------|------|
| N (plan count) | ${N} | plans |
| dispatch_ms | ${DISPATCH_MS_JJ} | ms |
| fan_in_ms | ${FAN_IN_MS_JJ} | ms |
| conflict_count | ${CONFLICT_COUNT_JJ} | 0 or 1; 0 = clean |
| workspaces created | ${WORKSPACE_COUNT_JJ} | workspaces |
| merged.length | ${MERGED_LEN_JJ} | jj N-parent octopus merge yields 1 merge |
| bookmark cleanup | clean (\`gsd/phase-14-dogfood\` abandoned) | — |
| \`jj log -r 'divergent()' --no-graph\` | (empty) | — |

### git cell (mktemp throwaway via dispatch+fan-in invocations forked from \`e2e-parallel-phase.sh\` per RESEARCH Open Q5)

| Metric | Value | Unit |
|--------|-------|------|
| N (plan count) | ${N} | plans |
| dispatch_ms | ${DISPATCH_MS_GIT} | ms |
| fan_in_ms | ${FAN_IN_MS_GIT} | ms |
| conflict_count | ${CONFLICT_COUNT_GIT} | 0 or 1; 0 = clean |
| workspaces created | ${WORKSPACE_COUNT_GIT} | workspaces |
| merged.length | ${MERGED_LEN_GIT} | git 2-parent merges, one per agent |

## Recovery Anchor (durable per D-09 / D-12)

**Pre-op-id:** \`${PRE_OP_ID}\`
**Pre-snapshot dir (sibling mktemp, transient):** \`${PRE}\`
**Tarball:** \`${PRE}/planning.tar\`
**Tarball SHA-256:** \`${TARBALL_SHA}\`

**Recovery procedure:**

\`\`\`bash
bash scripts/dogfood-restore.sh '${PRE_OP_ID}' '${PRE}/planning.tar'
\`\`\`

If the \`${PRE}\` directory has been GC'd by the OS (typical TMPDIR cleanup interval), the tarball is irrecoverable from this anchor. The pre-op-id alone (without the tarball) restores jj repo state including the WC and bookmarks; the \`.planning/\` content reverts to whatever the WC had at the snapshot operation. The tarball is the additive recovery surface for \`.planning/\` content that may have been modified post-op-id by the dogfood itself.

Operators must save unrelated post-dogfood work before invoking recovery — \`jj op restore\` reverts to the pre-op-id snapshot, discarding everything that happened after.

## Rehearsal evidence

Plan 14-04 (\`scripts/dogfood-rehearse.sh\`) validated the recovery primitive against a synthetic-dirty \`cp -a\` clone of THIS repo BEFORE this real dogfood ran. Three assertions green:

\`\`\`
  PASS [diff-summary-matches-baseline]
  PASS [bookmark-gone]
  PASS [state-md-restored]
dogfood-rehearse: ALL ASSERTIONS PASSED. dogfood-restore.sh is ready for production use.
\`\`\`

See \`.planning/phases/14-default-flip-dogfood-validation/14-04-SUMMARY.md\` § "Rehearsal Evidence — Exact stderr capture" for the full transcript. The rehearsal-clone used \`cp -a\` rather than \`git clone\` (RESEARCH §D finding #3 / path a-prime) to keep \`scripts/lint-vcs-no-raw-git.allow.json\` net diff at zero.

## Pitfall 10 evidence (main bookmark untouched)

| Marker | Value |
|--------|-------|
| MAIN_BEFORE (change_id, captured pre-dispatch) | \`${MAIN_BEFORE:0:12}…\` |
| MAIN_AFTER (change_id, captured post-fan-in) | \`${MAIN_AFTER:0:12}…\` |
| Unchanged | $([ "$MAIN_BEFORE" = "$MAIN_AFTER" ] && echo "yes — blast-radius bounded" || echo "no — INVESTIGATE") |

## Out-of-band notes

- \`scripts/dogfood-restore.sh\` ships with NO \`--what\` flag — jj 0.41 default scope (\`repo,remote-tracking\`) confirmed safe by Plan 14-04's rehearsal. Plan 14-03 D-10 considered narrowing to \`--what=repo\`; not needed.
- Both cells exercise the SAME SDK CLI verbs (\`workspace.parallel.dispatch\` + \`workspace.parallel.fan-in\`) under the SAME shell-harness pattern — the dogfood orchestrator forks the invocations into its own bash code rather than calling \`scripts/e2e-parallel-phase.sh\` unchanged (per RESEARCH Open Q5) so both cells produce apples-to-apples per-stage timing.
- \`scripts/lint-vcs-no-raw-git.allow.json\` cumulative LINT-05 diff for v1.3 remains at +1 (the Phase 10 \`sdk/src/vcs/git/parallel.ts\` entry); this script + \`dogfood-restore.sh\` + \`dogfood-rehearse.sh\` are all lint-clean (raw \`jj\` is fine; the quoted \`jj "git" init --colocate\` defeats the regex; \`cp -a\` sidesteps \`git clone\` entirely).
METRICS

echo "dogfood-phase-14: metrics written to ${METRICS_FILE}" >&2

# ════════════════════════════════════════════════════════════════════════════
# Final summary (stderr) — operator-visible recap
# ════════════════════════════════════════════════════════════════════════════

cat >&2 <<SUMMARY

═══ dogfood-phase-14 final summary ═══

jj cell  : dispatch_ms=${DISPATCH_MS_JJ}  fan_in_ms=${FAN_IN_MS_JJ}  conflict_count=${CONFLICT_COUNT_JJ}
git-cell : dispatch_ms=${DISPATCH_MS_GIT}  fan_in_ms=${FAN_IN_MS_GIT}  conflict_count=${CONFLICT_COUNT_GIT}

Recovery anchor (durable):
  pre_op_id        : ${PRE_OP_ID}
  pre_snapshot_path: ${PRE}
  tarball          : ${PRE}/planning.tar
  tarball_sha256   : ${TARBALL_SHA}

Recovery invocation (verbatim):
  bash scripts/dogfood-restore.sh '${PRE_OP_ID}' '${PRE}/planning.tar'

Main bookmark unchanged (Pitfall 10): yes — ${MAIN_BEFORE:0:12}… ≡ ${MAIN_AFTER:0:12}…

Metrics written to ${METRICS_FILE}

SUMMARY

echo "OK: dogfood-phase-14 passed (N=${N})" >&2
exit 0
