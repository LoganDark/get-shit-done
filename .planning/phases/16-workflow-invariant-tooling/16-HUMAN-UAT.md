---
status: partial
phase: 16-workflow-invariant-tooling
source: [16-VERIFICATION.md]
started: 2026-05-25T05:48:00Z
updated: 2026-05-25T05:48:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. `parallel-e2e-gate` is bound as a required status check on protected branches

expected: GitHub branch-protection ruleset for the `jj-vcs` branch (and any other protected branches) lists `parallel-e2e-gate` (NOT the `parallel-e2e` matrix job itself) as a required passing status check. The new LINT-06 step runs INSIDE the `parallel-e2e` matrix job, which feeds into `parallel-e2e-gate` via `if: always()` + aggregate-result check at `.github/workflows/parallel-e2e.yml:146`. Without the gate binding in GitHub UI, the lint failure would not actually block PR merges — the YAML wiring is necessary but not sufficient.

how to verify: Open the repo settings on GitHub → Branches → Branch protection rules / Rulesets → find the rule covering `jj-vcs` (and `main` if protected) → confirm `parallel-e2e-gate` is in the "Required status checks" list. Command-line equivalent (requires `gh` auth + repo admin):

```bash
gh api repos/gsd-build/get-shit-done/branches/jj-vcs/protection --jq '.required_status_checks.checks[].context'
```

The output should include `parallel-e2e-gate`.

result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
