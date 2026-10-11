# Proposal

## Why

PR mode currently merges every moved base into the change's branch to avoid rewriting published commits, although the loop first pushes that branch at delivery. Issue [#47](https://github.com/pfa230/openspec-loop/issues/47) asks to remove those unnecessary merge commits and use the same integration method in every delivery mode.

## What Changes

- Rebase onto the current base in `pr`, `local` and `merge` modes; abandon a conflicting rebase and merge the base instead.
- Keep PR publication at delivery, after integration and archival, using the existing non-force push before opening the pull request.
- Accept an already-pushed user branch without a publication check at enrollment. If rebasing makes the delivery push non-fast-forward, stop with Git's rejection and the existing recovery flow; the user reconciles the branch before explicitly continuing.
- Replace the spec's PR merge-only rule and update the README to describe one integration rule and the already-pushed branch consequence.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: unify Integration method across delivery modes and make PR publication timing and rejected-push behavior explicit in Integration and delivery.

## Impact

- `src/controller.ts`: remove the PR shortcut in `integration()` and reuse its rebase/conflict fallback.
- `test/integration.test.ts`: replace the PR merge-only assertions and cover PR conflict fallback using the existing real Git fixtures.
- `test/delivery.test.ts`: verify publication happens only at delivery and an already-pushed branch stops on rejection and can explicitly resume after reconciliation.
- `README.md`: update integration and PR delivery guidance.
- No new dependencies, CLI options, configuration keys or run-state fields.
