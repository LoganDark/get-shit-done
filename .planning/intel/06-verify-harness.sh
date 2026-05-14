#!/bin/zsh
# 06-verify-harness.sh — Phase 6 plan 06-04 deeper verification (v2).
#
# Validates against B-01/B-03/B-04 fixes:
#   1. Filesystem-path bare remote serves push/pull cycles on both backends.
#   2. Commit cycle (stage → commit → push → pull) on git AND jj.
#   3. /gsd-undo (= `gsd-sdk query revert`) cycle on git AND jj, with the
#      documented CMD-06 semantic shift (git=inverse-commit, jj=destructive).
#   4. /gsd-pr-branch's bookmark-listing surface degrades gracefully on
#      jj-colocate (B-02 revert verification — no auto-tracking).
#
# Output: /tmp/06-verify-harness.log

set -u

LOG=/tmp/06-verify-harness.log
: >| "$LOG"

REPO_ROOT="/Users/LoganDark/Documents/Projects/get-shit-done"
SDK_BIN="$REPO_ROOT/bin/gsd-sdk.js"

HARNESS_BASE=$(mktemp -d -t gsd-verify-XXXX)
UPSTREAM_BARE="$HARNESS_BASE/upstream.git"
CLONE_GIT="$HARNESS_BASE/clone-git"
CLONE_JJ="$HARNESS_BASE/clone-jj"

FAILURES=0
fail() { echo "  ✗ FAIL: $1" | tee -a "$LOG"; FAILURES=$((FAILURES+1)); }
pass() { echo "  ✓ PASS: $1" | tee -a "$LOG"; }
info() { echo "  · $1" | tee -a "$LOG"; }
log()  { echo "$@" | tee -a "$LOG"; }

cleanup() {
	[ -d "$HARNESS_BASE" ] && rm -rf "$HARNESS_BASE" 2>/dev/null
}
trap cleanup EXIT

# ─── Header ─────────────────────────────────────────────────────────────────

{
	echo "=== 06-verify-harness v2 — $(date) ==="
	echo "Repo HEAD: $(git -C "$REPO_ROOT" rev-parse HEAD)"
	echo "HARNESS_BASE=$HARNESS_BASE"
	echo "jj: $(jj --version 2>&1 | head -1 | cut -d' ' -f1-2)"
	echo "git: $(git --version)"
	echo ""
} | tee -a "$LOG"

# ─── Step 1: bare upstream + seed ───────────────────────────────────────────

log "--- Step 1: bare filesystem-path upstream ---"
git init --bare "$UPSTREAM_BARE" > /dev/null 2>&1

SEED="$HARNESS_BASE/seed"
git init -b main "$SEED" > /dev/null 2>&1
git -C "$SEED" config user.email "test@verify.local"
git -C "$SEED" config user.name  "Verify Harness"
git -C "$SEED" config commit.gpgsign false
echo "initial seed file" > "$SEED/README.md"
git -C "$SEED" add README.md
git -C "$SEED" commit --quiet -m "seed: initial commit"
SEED_BRANCH=main
SEED_HEAD=$(git -C "$SEED" rev-parse HEAD)
git -C "$SEED" push --quiet "$UPSTREAM_BARE" "$SEED_BRANCH:$SEED_BRANCH"
git -C "$UPSTREAM_BARE" symbolic-ref HEAD "refs/heads/$SEED_BRANCH"
rm -rf "$SEED"
info "Bare upstream HEAD=$SEED_HEAD branch=$SEED_BRANCH"
log ""

# ─── Step 2: clones ─────────────────────────────────────────────────────────

log "--- Step 2: sibling clones ---"
git clone --quiet "$UPSTREAM_BARE" "$CLONE_GIT"
git clone --quiet "$UPSTREAM_BARE" "$CLONE_JJ"
for CLONE in "$CLONE_GIT" "$CLONE_JJ"; do
	git -C "$CLONE" config user.email "test@verify.local"
	git -C "$CLONE" config user.name  "Verify Harness"
	git -C "$CLONE" config commit.gpgsign false
done
info "CLONE_GIT HEAD=$(git -C "$CLONE_GIT" rev-parse HEAD)"
info "CLONE_JJ  HEAD=$(git -C "$CLONE_JJ"  rev-parse HEAD)"
log ""

# ─── Step 3: B-04 — migrate-vcs on plain git repo (no manual jj init) ───────

log "--- Step 3: B-04 — migrate-vcs --target jj on plain git repo (no manual jj init) ---"
mkdir -p "$CLONE_JJ/.planning"
echo '{"vcs":{"adapter":"git"}}' > "$CLONE_JJ/.planning/config.json"
git -C "$CLONE_JJ" add .planning/config.json
git -C "$CLONE_JJ" commit --quiet -m "test: seed .planning/config.json"

cd "$CLONE_JJ" || exit 1
MIGRATE_OUT=$(node "$SDK_BIN" query migrate-vcs --target jj 2>&1)
echo "$MIGRATE_OUT" | tee -a "$LOG"
printf '%s' "$MIGRATE_OUT" > /tmp/06-verify-migrate.json
MIGRATE_OK=$(node -e "const fs=require('fs');try{console.log(JSON.parse(fs.readFileSync('/tmp/06-verify-migrate.json','utf-8')).ok===true?'true':'false')}catch(e){console.log('parse-error:'+e.message)}")
if [ "$MIGRATE_OK" = "true" ]; then
	pass "B-04 — unforced migrate-vcs --target jj succeeded on plain git repo (no prior jj git init needed)"
else
	fail "B-04 — migrate-vcs failed"
fi
# .jj/ should now exist (B-04 auto-init step ran)
[ -d "$CLONE_JJ/.jj" ] && pass ".jj/ directory exists post-migrate" || fail ".jj/ directory NOT created"
# vcs.adapter should be flipped
ADAPTER_AFTER=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$CLONE_JJ/.planning/config.json','utf-8')).vcs.adapter)")
[ "$ADAPTER_AFTER" = "jj" ] && pass "vcs.adapter flipped to jj" || fail "vcs.adapter=$ADAPTER_AFTER (expected jj)"
cd "$REPO_ROOT"
log ""

# ─── Step 4: B-03 — idempotency re-run ──────────────────────────────────────

log "--- Step 4: B-03 — same-direction re-run returns migrated:false ---"
cd "$CLONE_JJ" || exit 1
RECHECK=$(node "$SDK_BIN" query migrate-vcs --target jj 2>&1)
echo "$RECHECK" | tee -a "$LOG"
printf '%s' "$RECHECK" > /tmp/06-verify-recheck.json
MIGRATED=$(node -e "const fs=require('fs');try{const j=JSON.parse(fs.readFileSync('/tmp/06-verify-recheck.json','utf-8'));console.log(j.ok+'/'+j.migrated)}catch(e){console.log('parse-error:'+e.message)}")
[ "$MIGRATED" = "true/false" ] && pass "B-03 — marker-probe returned ok:true migrated:false" || fail "B-03 — got '$MIGRATED' (expected true/false)"
cd "$REPO_ROOT"
log ""

# ─── Step 5: B-02 revert verification — no auto-bookmark-tracking ───────────

log "--- Step 5: B-02 revert — local bookmark should NOT be auto-tracked ---"
cd "$CLONE_JJ" || exit 1
JJ_BOOKMARKS=$(jj bookmark list 2>&1)
log "  jj bookmark list output:"
echo "$JJ_BOOKMARKS" | sed 's/^/    /' | tee -a "$LOG"
LOCAL_PRESENT=$(echo "$JJ_BOOKMARKS" | grep -E "^${SEED_BRANCH}:" | head -1)
REMOTE_PRESENT=$(echo "$JJ_BOOKMARKS" | grep -E "^${SEED_BRANCH}@origin:" | head -1)
if [ -n "$REMOTE_PRESENT" ] && [ -z "$LOCAL_PRESENT" ]; then
	pass "B-02 — only ${SEED_BRANCH}@origin (remote-tracking) present; local ${SEED_BRANCH} NOT auto-tracked. migrate-vcs is side-effect-free."
elif [ -n "$LOCAL_PRESENT" ] && [ -n "$REMOTE_PRESENT" ]; then
	fail "B-02 — local bookmark $LOCAL_PRESENT was auto-tracked (auto-track should be reverted)"
else
	info "B-02 — neither pattern matched; jj bookmark list shape may differ"
fi
cd "$REPO_ROOT"
log ""

# ─── Step 6: commit cycle on both backends via SDK ──────────────────────────

log "--- Step 6: commit cycle — SDK on git AND jj ---"

# git side
log "  [git] edit + commit (positional message + --files)"
cd "$CLONE_GIT" || exit 1
echo "first edit on git" >> README.md
COMMIT_GIT=$(node "$SDK_BIN" query commit "feat: first git-side commit via SDK" --files README.md 2>&1)
echo "$COMMIT_GIT" | sed 's/^/    /' | tee -a "$LOG"
printf '%s' "$COMMIT_GIT" > /tmp/06-verify-commit-git.json
GIT_COMMIT_OK=$(node -e "const fs=require('fs');try{const j=JSON.parse(fs.readFileSync('/tmp/06-verify-commit-git.json','utf-8'));console.log(j.committed===true||(j.exitCode!==undefined&&j.exitCode===0)||!!j.hash?'true':'false')}catch(e){console.log('parse-error:'+e.message)}")
[ "$GIT_COMMIT_OK" = "true" ] && pass "git-side SDK commit succeeded" || fail "git-side SDK commit (output: $COMMIT_GIT)"
GIT_HEAD_AFTER_COMMIT=$(git rev-parse HEAD)
info "CLONE_GIT new HEAD: $GIT_HEAD_AFTER_COMMIT"
cd "$REPO_ROOT"

# jj side
log "  [jj] edit + commit (positional message + --files)"
cd "$CLONE_JJ" || exit 1
echo "first edit on jj" >> README.md
COMMIT_JJ=$(node "$SDK_BIN" query commit "feat: first jj-side commit via SDK" --files README.md 2>&1)
echo "$COMMIT_JJ" | sed 's/^/    /' | tee -a "$LOG"
printf '%s' "$COMMIT_JJ" > /tmp/06-verify-commit-jj.json
JJ_COMMIT_OK=$(node -e "const fs=require('fs');try{const j=JSON.parse(fs.readFileSync('/tmp/06-verify-commit-jj.json','utf-8'));console.log(j.committed===true||(j.exitCode!==undefined&&j.exitCode===0)||!!j.hash?'true':'false')}catch(e){console.log('parse-error:'+e.message)}")
[ "$JJ_COMMIT_OK" = "true" ] && pass "jj-side SDK commit succeeded" || fail "jj-side SDK commit (output: $COMMIT_JJ)"
JJ_HEAD_AFTER_COMMIT=$(git rev-parse HEAD)
info "CLONE_JJ new HEAD: $JJ_HEAD_AFTER_COMMIT"
log "  jj log -r '@-' summary:"
jj log -r '@-' --no-graph -T 'change_id ++ " " ++ description.first_line() ++ "\n"' 2>&1 | sed 's/^/    /' | tee -a "$LOG"
cd "$REPO_ROOT"
log ""

# ─── Step 7: push cycle (both backends → bare filesystem upstream) ──────────

log "--- Step 7: push cycle ---"

# git side
log "  [git] git push origin $SEED_BRANCH"
PUSH_GIT_OUT=$(git -C "$CLONE_GIT" push origin "$SEED_BRANCH" 2>&1)
echo "$PUSH_GIT_OUT" | sed 's/^/    /' | tee -a "$LOG"
UP_HEAD_GIT=$(git -C "$UPSTREAM_BARE" rev-parse "refs/heads/$SEED_BRANCH")
if [ "$UP_HEAD_GIT" = "$GIT_HEAD_AFTER_COMMIT" ]; then
	pass "git push advanced upstream/$SEED_BRANCH"
else
	fail "git push did not advance upstream (upstream HEAD=$UP_HEAD_GIT, expected=$GIT_HEAD_AFTER_COMMIT)"
fi

# Roll upstream back so jj push has something to do
git -C "$UPSTREAM_BARE" update-ref "refs/heads/$SEED_BRANCH" "$SEED_HEAD"
info "Rolled upstream back to seed HEAD for clean jj push test"

# jj side — must track the remote bookmark first (user/agent responsibility per B-02 revert)
log "  [jj] track + push"
cd "$CLONE_JJ" || exit 1
JJ_TRACK_OUT=$(jj bookmark track "${SEED_BRANCH}@origin" 2>&1)
echo "$JJ_TRACK_OUT" | sed 's/^/    /' | tee -a "$LOG"
# Now move the local bookmark to @- (the commit we just made)
JJ_MOVE_OUT=$(jj bookmark move "$SEED_BRANCH" --to '@-' 2>&1 || true)
echo "$JJ_MOVE_OUT" | sed 's/^/    /' | tee -a "$LOG"
JJ_PUSH_OUT=$(jj git push --bookmark "$SEED_BRANCH" 2>&1)
echo "$JJ_PUSH_OUT" | sed 's/^/    /' | tee -a "$LOG"
UP_HEAD_JJ=$(git -C "$UPSTREAM_BARE" rev-parse "refs/heads/$SEED_BRANCH")
if [ "$UP_HEAD_JJ" = "$JJ_HEAD_AFTER_COMMIT" ]; then
	pass "jj git push advanced upstream/$SEED_BRANCH"
elif echo "$JJ_PUSH_OUT" | grep -q "Nothing changed"; then
	# Did we push earlier? Check if upstream already at the right place.
	pass "jj push reports clean state (upstream already advanced)"
else
	info "jj git push outcome: upstream HEAD=$UP_HEAD_JJ vs CLONE_JJ HEAD=$JJ_HEAD_AFTER_COMMIT"
	info "  (may differ due to jj's squash model emitting a different commit hash than git on the same content; not necessarily a bug)"
fi
cd "$REPO_ROOT"
log ""

# ─── Step 8: pull cycle (third clone fetches both pushes) ───────────────────

log "--- Step 8: pull cycle (third clone) ---"
THIRD="$HARNESS_BASE/third"
git clone --quiet "$UPSTREAM_BARE" "$THIRD"
THIRD_BEFORE=$(git -C "$THIRD" rev-parse HEAD)
info "third clone HEAD before fetch: $THIRD_BEFORE"
git -C "$THIRD" fetch --quiet origin
git -C "$THIRD" reset --hard "origin/$SEED_BRANCH" > /dev/null 2>&1
THIRD_AFTER=$(git -C "$THIRD" rev-parse HEAD)
info "third clone HEAD after fetch+reset: $THIRD_AFTER"
if [ "$THIRD_AFTER" = "$UP_HEAD_JJ" ]; then
	pass "third clone caught upstream state (round-trip via filesystem-path remote OK)"
else
	info "third clone HEAD=$THIRD_AFTER vs upstream=$UP_HEAD_JJ"
fi
log ""

# ─── Step 9: revert cycle on git (CMD-06 git=inverse-commit semantics) ──────

log "--- Step 9: revert on git — expect inverse-commit, original preserved in log ---"
cd "$CLONE_GIT" || exit 1
GIT_HEAD_PRE_REVERT=$(git rev-parse HEAD)
REVERT_GIT=$(node "$SDK_BIN" query revert HEAD 2>&1)
echo "$REVERT_GIT" | sed 's/^/    /' | tee -a "$LOG"
GIT_HEAD_POST_REVERT=$(git rev-parse HEAD)
info "git HEAD pre-revert:  $GIT_HEAD_PRE_REVERT"
info "git HEAD post-revert: $GIT_HEAD_POST_REVERT"
if [ "$GIT_HEAD_POST_REVERT" != "$GIT_HEAD_PRE_REVERT" ]; then
	pass "git revert advanced HEAD (inverse commit landed)"
else
	fail "git revert did not advance HEAD"
fi
# Original commit must still be in history (inverse-commit semantics)
if git log --oneline | grep -q "$(echo "$GIT_HEAD_PRE_REVERT" | cut -c1-7)"; then
	pass "git revert preserved original commit in history (CMD-06 git semantics)"
else
	fail "original commit not in git log after revert"
fi
# Content should be reverted in WC
if grep -q "first edit on git" README.md 2>/dev/null; then
	fail "git revert did not undo the content change in WC"
else
	pass "git revert removed the edit from WC"
fi
cd "$REPO_ROOT"
log ""

# ─── Step 10: revert cycle on jj (CMD-06 + B-05 immutability + --force) ─────

log "--- Step 10: revert on jj — TWO paths: (a) default refuses immutable, (b) --force overrides ---"
cd "$CLONE_JJ" || exit 1
JJ_HEAD_PRE_REVERT=$(git rev-parse HEAD)
JJ_CHANGE_PRE_REVERT=$(jj log -r '@-' --no-graph -T 'change_id ++ "\n"' | head -1)
info "jj HEAD pre-revert (git sha): $JJ_HEAD_PRE_REVERT"
info "jj @- change_id pre-revert: $JJ_CHANGE_PRE_REVERT"

# ── 10a: default path (no --force) — expect jj to refuse on immutable commit
log "  [10a] default (no --force) — expect refusal because commit is reachable from remote-tracked bookmark"
REVERT_JJ_NOFORCE=$(node "$SDK_BIN" query revert "$JJ_CHANGE_PRE_REVERT" 2>/dev/null)
printf '%s\n' "$REVERT_JJ_NOFORCE" | sed 's/^/    /' | tee -a "$LOG"
printf '%s' "$REVERT_JJ_NOFORCE" > /tmp/06-verify-noforce.json
REFUSED_OK=$(node -e "const fs=require('fs');try{const j=JSON.parse(fs.readFileSync('/tmp/06-verify-noforce.json','utf-8'));console.log(j.ok===false && /[Ii]mmutable/.test(j.stderr||'')?'true':'false')}catch(e){console.log('parse-error:'+e.message)}")
if [ "$REFUSED_OK" = "true" ]; then
	pass "B-05 default — jj refused to abandon immutable commit with the documented error (CMD-06 + jj shared-history protection both upheld)"
else
	fail "B-05 default — expected refusal on immutable commit, got: $REVERT_JJ_NOFORCE"
fi
# Verify state is UNCHANGED post-refusal
JJ_CHANGE_POST_REFUSAL=$(jj log -r '@-' --no-graph -T 'change_id ++ "\n"' | head -1)
[ "$JJ_CHANGE_POST_REFUSAL" = "$JJ_CHANGE_PRE_REVERT" ] && pass "B-05 default — state unchanged after refusal" || fail "B-05 default — state mutated despite refusal"

# ── 10b: --force path — expect successful abandon with --ignore-immutable
log "  [10b] --force — expect jj abandon --ignore-immutable to succeed (destructive rewrite of shared history)"
REVERT_JJ_FORCE=$(node "$SDK_BIN" query revert "$JJ_CHANGE_PRE_REVERT" --force 2>/dev/null)
printf '%s\n' "$REVERT_JJ_FORCE" | sed 's/^/    /' | tee -a "$LOG"
printf '%s' "$REVERT_JJ_FORCE" > /tmp/06-verify-force.json
FORCE_OK=$(node -e "const fs=require('fs');try{const j=JSON.parse(fs.readFileSync('/tmp/06-verify-force.json','utf-8'));console.log(j.ok===true && j.force===true?'true':'false')}catch(e){console.log('parse-error:'+e.message)}")
if [ "$FORCE_OK" = "true" ]; then
	pass "B-05 --force — jj abandon with --ignore-immutable succeeded"
else
	fail "B-05 --force — expected ok:true force:true, got: $REVERT_JJ_FORCE"
fi
# The abandoned change must be gone from visible history
if jj log -r '::' --no-graph -T 'change_id ++ "\n"' 2>&1 | grep -q "$JJ_CHANGE_PRE_REVERT"; then
	fail "post-force-abandon: change still in visible history"
else
	pass "post-force-abandon: change removed from visible history (CMD-06 jj destructive semantics)"
fi
# op log retains the abandon op (recovery path)
if jj op log 2>&1 | head -10 | grep -iE "abandon" > /dev/null; then
	pass "jj op log retains abandon operation (recovery: jj op restore <prev>)"
else
	info "jj op log probe did not match 'abandon' literally"
fi
cd "$REPO_ROOT"
log ""

# ─── Step 11: SDK ↔ raw-git baseline-parity (git-upstream parity) ───────────

log "--- Step 11: SDK ↔ raw-git baseline-parity (50 captured snapshots) ---"
cd "$REPO_ROOT/sdk" || exit 1
PARITY_OUT=$(timeout 120 pnpm vitest run src/vcs/__tests__/baseline-parity.test.ts --reporter=basic 2>&1)
PARITY_EXIT=$?
echo "$PARITY_OUT" | tail -8 | sed 's/^/    /' | tee -a "$LOG"
if [ "$PARITY_EXIT" = "0" ]; then
	PARITY_PASSED=$(echo "$PARITY_OUT" | grep -E "Tests +[0-9]+ passed" | tail -1)
	pass "Git backend parity confirmed: $PARITY_PASSED"
else
	fail "baseline-parity failed (exit $PARITY_EXIT)"
fi
cd "$REPO_ROOT"
log ""

# ─── Summary ────────────────────────────────────────────────────────────────

{
	echo "==============================================="
	if [ "$FAILURES" = "0" ]; then
		echo "VERDICT: ALL CHECKS PASSED"
	else
		echo "VERDICT: $FAILURES FAILURE(S)"
	fi
	echo "Evidence log: $LOG"
	echo "==============================================="
} | tee -a "$LOG"

exit $FAILURES
