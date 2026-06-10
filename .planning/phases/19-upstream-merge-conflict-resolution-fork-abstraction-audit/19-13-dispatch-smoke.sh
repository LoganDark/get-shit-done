#!/bin/zsh
# 19-13 Task 1 (3): PORT-02 end-to-end dispatch smoke.
# Cell A: tmp jj-only (non-colocated) repo, launcher sourced from a SUBDIRECTORY.
# Cell B: tmp git repo (jj git init --colocate seed + GSD_VCS=git pin, Phase 13
#         lint-clean precedent), launcher sourced from a SUBDIRECTORY.
# Each cell symlinks this repo's gsd-core/ into the tmp root so the snippet's
# first probe leg ($ROOT/gsd-core/bin/gsd-tools.cjs) resolves THIS repo's bridge.
set -u
REPO=/Users/LoganDark/Documents/Projects/get-shit-done-2
SNIPPET="$REPO/gsd-core/workflows/_runtime-launcher.snippet.sh"
fail() { echo "FAIL: $1" >&2; exit 1 }

run_cell() {
	local label=$1 colocate=$2 vcs_env=$3
	local tmp
	tmp=$(mktemp -d /tmp/gsd-19-13-smoke.XXXXXX)
	echo "=== cell $label (tmp=$tmp) ==="
	cd "$tmp"
	if [ "$colocate" = yes ]; then
		jj git init --colocate . >/dev/null 2>&1 || fail "$label: jj git init --colocate"
	else
		jj git init --no-colocate . >/dev/null 2>&1 || fail "$label: jj git init"
	fi
	ln -s "$REPO/gsd-core" gsd-core
	mkdir -p sub/dir
	cd sub/dir
	# subshell: source the REAL launcher snippet from the subdirectory
	local out
	out=$(
		set -e
		if [ -n "$vcs_env" ]; then export GSD_VCS="$vcs_env"; fi
		source "$SNIPPET"
		echo "GSD_TOOLS=$GSD_TOOLS"
		gsd_run query status
	) || fail "$label: snippet/sourcing or gsd_run exited nonzero"
	printf '%s\n' "$out" | sed -n '1p'
	local resolved
	resolved=$(printf '%s\n' "$out" | sed -n '1p' | cut -d= -f2)
	[ "$(readlink -f "$resolved")" = "$(readlink -f "$REPO/gsd-core/bin/gsd-tools.cjs")" ] \
		|| fail "$label: GSD_TOOLS did not resolve to this repo's gsd-tools (got $resolved)"
	local envelope
	envelope=$(printf '%s\n' "$out" | sed '1d')
	printf '%s\n' "$envelope"
	printf '%s\n' "$envelope" | jq -e '.ok == true and has("entries") and has("porcelain")' >/dev/null \
		|| fail "$label: query status did not return a valid envelope"
	echo "cell $label: PASS (root=$tmp resolved from sub/dir; envelope valid)"
	cd /
	rm -rf "$tmp"
}

run_cell jj-only no ""
run_cell git yes git
echo "DISPATCH SMOKE: BOTH CELLS PASS"
