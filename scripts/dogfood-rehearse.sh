#!/usr/bin/env bash
# dogfood-rehearse.sh — D-11 rehearsal of scripts/dogfood-restore.sh.
#
# Validates the Phase 14 recovery primitive (scripts/dogfood-restore.sh from
# Plan 14-03) against a synthetic-dirty clone of THIS repo BEFORE the real
# Phase 14 dogfood (Plan 14-05) ships. Pitfall 10 framing: the loud-fail
# rollback recovery "must work the first time" — that intent is only
# meaningful with empirical evidence, so we exercise the restore script
# against a known-good synthetic dirty state and assert post-restore
# invariants.
#
# Rehearsal mechanism (per 14-CONTEXT D-11 + 14-RESEARCH §D / finding #3):
#   1. mktemp a sibling rehearsal-clone directory and a sibling pre-snapshot
#      directory (NEVER inside this repo's WC — memory
#      `feedback_avoid_jj_auto_tracked_output`).
#   2. Clone this repo into the rehearsal dir via `cp -a` (NOT `git clone`).
#      Rationale: `cp -a` preserves both `.git/` and `.jj/` verbatim and adds
#      ZERO entries to `scripts/lint-vcs-no-raw-git.allow.json` (the LINT-05
#      cumulative budget stays at +1, not +2). `git clone` would force an
#      allowlist addition; `cp -a` sidesteps it entirely. RESEARCH finding
#      #3 (alt path "a-prime") recommends this and is the path locked here.
#   3. Capture the REHEARSAL clone's OWN pre-snapshot (separate from the
#      real dogfood's snapshot). This proves dogfood-restore.sh is
#      self-contained — not coupled to one specific op-id.
#   4. Synthesize a dirty state (modify a tracked file + create a leftover
#      bookmark + `jj squash` to record the dirty change).
#   5. Invoke dogfood-restore.sh against the rehearsal clone with the
#      rehearsal's own pre-op-id + tarball.
#   6. Assert: `jj diff --summary` empty, synthetic bookmark gone,
#      .planning/STATE.md content fully restored (no rehearsal-dirty marker).
#   7. Cleanup both temp dirs via `trap` on EXIT.
#
# Pre-condition: must be run from the project root.

set -euo pipefail

# ─── Project-root precondition ────────────────────────────────────────────────

if [ ! -f "$PWD/.planning/config.json" ]; then
	echo "FATAL: must be run from the project root (no .planning/config.json at $PWD)" >&2
	exit 1
fi
REPO_ROOT="$PWD"

# ─── mktemp sibling dirs (NEVER inside the WC) ────────────────────────────────

REHEARSAL=$(mktemp -d "${TMPDIR:-/tmp}/gsd-dogfood-rehearsal-XXXX")
REH_PRE=$(mktemp -d "${TMPDIR:-/tmp}/gsd-rehearsal-pre-XXXX")
echo "dogfood-rehearse: REHEARSAL=${REHEARSAL}" >&2
echo "dogfood-rehearse: REH_PRE=${REH_PRE}" >&2

cleanup() {
	rm -rf "$REHEARSAL" "$REH_PRE"
}
trap cleanup EXIT

# ─── Assert helpers ───────────────────────────────────────────────────────────

assert_pass() {
	local name="$1"
	echo "  PASS [${name}]" >&2
}
assert_fail() {
	local name="$1" detail="$2"
	echo "FAIL [${name}]: ${detail}" >&2
	exit 1
}

# ─── Clone the repo into the rehearsal dir via cp -a ──────────────────────────
#
# The trailing `/.` on the source + `/` on the target copies the CONTENTS of
# the source dir (including hidden `.git/` and `.jj/`) into the target,
# rather than nesting the source dir inside the target. Verified against
# RESEARCH §D finding #3 (alt path a-prime) — preserves both VCS metadata
# directories verbatim and avoids the LINT-05 allowlist entry that
# `git clone` would force.

echo "dogfood-rehearse: cloning ${REPO_ROOT} via cp -a (preserves .git/ + .jj/)" >&2
cp -a "$REPO_ROOT/." "$REHEARSAL/"

cd "$REHEARSAL"

# ─── Capture the rehearsal clone's own pre-snapshot ───────────────────────────
#
# The op-id captured here belongs to the rehearsal clone's jj operation log,
# NOT the host repo's. The rehearsal is self-contained: its restore target
# is whatever op-id existed in the clone at this exact moment.

REH_PRE_OP_ID=$(jj op log -n 1 --no-graph -T 'id ++ "\n"')
echo "dogfood-rehearse: REH_PRE_OP_ID=${REH_PRE_OP_ID}" >&2

jj op log -n 200 > "${REH_PRE}/pre.oplog"
tar -cf "${REH_PRE}/planning.tar" .planning/
echo "dogfood-rehearse: tarball=${REH_PRE}/planning.tar" >&2

# Baseline diff at the pre-snapshot op-id. The host repo may have
# uncommitted-but-snapshotted WC content (e.g., this very script when it's
# first run before being committed); cp -a brings that forward verbatim.
# The post-restore invariant is "WC matches the pre-snapshot state" — NOT
# "WC is byte-empty" — so we capture the pre-snapshot diff here and assert
# against it post-restore. Rule-1 fix: the plan's literal assertion was
# "diff empty", but that only holds when the host has zero uncommitted
# changes at rehearsal time; the honest invariant the recovery primitive
# guarantees is "matches pre-snapshot baseline."
REH_BASELINE_DIFF=$(jj diff --summary)
echo "dogfood-rehearse: baseline diff snapshot captured ($(printf '%s' "$REH_BASELINE_DIFF" | wc -l | tr -d ' ') line(s))" >&2

# ─── Synthesize dirty state ───────────────────────────────────────────────────
#
# Three independent dirty signals:
#   - Modified tracked file content (.planning/STATE.md gets a marker line).
#   - Leftover bookmark (simulates a botched fan-in that didn't clean up).
#   - `jj squash` records the dirty content as a new change on top of the
#     pre-snapshot op-id, so the WC commit shifts forward — a recovery that
#     correctly restores will roll back both the bookmark and the squash.

echo "dogfood-rehearse: synthesizing dirty state in clone" >&2
echo "rehearsal-dirty" >> .planning/STATE.md
jj bookmark create gsd/agent-rehearsal -r @-
jj squash -m "rehearsal: synthetic dirty"
echo "dogfood-rehearse: dirty state ready (file modified + bookmark created + squash committed)" >&2

# ─── Invoke recovery script ───────────────────────────────────────────────────
#
# Runs from the rehearsal clone's cwd (cd'd above). The recovery script
# operates on the clone's jj state; the host repo at $REPO_ROOT is
# untouched throughout. `set -e` propagates a non-zero exit from the
# restore script.

echo "dogfood-rehearse: invoking ${REPO_ROOT}/scripts/dogfood-restore.sh against synthetic-dirty clone" >&2
bash "$REPO_ROOT/scripts/dogfood-restore.sh" "$REH_PRE_OP_ID" "${REH_PRE}/planning.tar"

# ─── Post-recovery assertions ─────────────────────────────────────────────────
#
# Assertion 1 — `jj diff --summary` in the clone matches its pre-snapshot
# baseline (captured at REH_PRE_OP_ID): working copy is restored to the
# exact state present when the snapshot was taken.
#
# Assertion 2 — `gsd/agent-rehearsal` bookmark is gone: `jj log -r
# 'gsd/agent-rehearsal'` exits NON-ZERO when the bookmark doesn't exist;
# the `if jj log ... ; then` branch fires only on SUCCESS, so the inverted
# test (failure of `jj log` = pass) is the correct shape.
#
# Assertion 3 — `.planning/STATE.md` content is restored: the
# `rehearsal-dirty` marker line is no longer present. Sanity check that
# the tarball extract actually fired (not just the op-restore).

DIFF=$(jj diff --summary)
if [ "$DIFF" != "$REH_BASELINE_DIFF" ]; then
	assert_fail "diff-summary-matches-baseline" "post-restore diff differs from pre-snapshot baseline.
  baseline: $(printf '%s' "$REH_BASELINE_DIFF")
  current:  $(printf '%s' "$DIFF")"
fi
assert_pass "diff-summary-matches-baseline"

if jj log -r 'gsd/agent-rehearsal' --no-graph >/dev/null 2>&1; then
	assert_fail "bookmark-gone" "gsd/agent-rehearsal bookmark survived restore"
fi
assert_pass "bookmark-gone"

if grep -q '^rehearsal-dirty$' .planning/STATE.md; then
	assert_fail "state-md-restored" ".planning/STATE.md still contains rehearsal-dirty marker"
fi
assert_pass "state-md-restored"

# ─── Green ────────────────────────────────────────────────────────────────────

echo "dogfood-rehearse: ALL ASSERTIONS PASSED. dogfood-restore.sh is ready for production use." >&2
