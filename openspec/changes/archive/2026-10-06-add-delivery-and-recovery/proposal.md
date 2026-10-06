## Why

Integration and delivery are still fixtures, so an archived change never reaches the default branch, a pull request or the remote. This change makes both stages real, gives the three delivery modes their Git operations, and makes resume safe after an interruption around archival, push, merge or pull request creation. This is build step 7 (#7).

## What Changes

- **Delivery mode.** `openspec/loop.yaml` gains a required `delivery` key: `local`, `pr` or `merge`.
- **The remote is the default branch's upstream.** `pr` and `merge` modes fetch from and push to the remote that Git records as the default branch's upstream, and use that upstream branch as the remote's default branch. `loop run` and `loop resume` refuse a `pr` or `merge` configuration when the default branch has no upstream. `local` mode contacts no remote.
- **The integration stage is real.**
  - `pr` mode merges the remote's default branch into the change's branch. The loop pushes that branch, so it never rewrites it.
  - `local` and `merge` modes rebase the change's branch onto the local default branch. When the rebase conflicts, the loop abandons it and merges instead, so a conflict stops integration once.
  - A conflicted merge stays in progress in the run's worktree. The implementer resolves it as a finding, and the loop's commit after the turn concludes the merge.
  - An integration that changes the change's patch also returns to the implementer, and so do failed required checks on the integrated result. The patch is compared without context lines or line numbers.
- **`merge` mode syncs the local default branch first.** Before integrating, the loop fast-forwards a local default branch that is behind its remote. It stops when the branch is ahead or has diverged, or when a checkout holding it has uncommitted changes to tracked files.
- **The delivery stage is real.**
  - `local` mode pushes nothing.
  - `pr` mode pushes the change's branch and opens a pull request with `gh`, titled with the change's name and described by its archived proposal.
  - `merge` mode checks that every checkout holding the default branch is clean and that the change's branch contains the default branch. It then pushes the change's commit to the remote's default branch and fast-forwards the local default branch to it. A rejected push leaves the local default branch unchanged.
- **Integration clears an interrupted operation.** A rebase or merge left in progress by an interruption before its handoff is aborted and redone.
- **Resume inspects completed effects where replaying would repeat them.** Pushes and fast-forwards repeat harmlessly, since Git does nothing when the effect is already there.
  - Archival with the change already moved commits what OpenSpec left instead of rerunning `openspec archive`.
  - An open pull request for the change's branch against the remote branch is reported instead of opening another. Both `gh` calls name the upstream remote's repository.
- **Removed: `LOOP_FIXTURE`** and the fixture stages, which were stand-ins for these two stages.

Not in this change:

- Starting a `pr`-mode run from the remote's default branch, as #7's scope suggested. The contract creates the change's branch from the commit where `loop run` is given, which holds the proposal, and integration brings in the remote's base before archival.
- Refusing simultaneous advancement. #3 built and tested the run lock.
- Removing the change's worktree or branch after delivery, or turning a delivered pull request into anything else. The run ends at delivery.
- Recovering from an interruption in the middle of `openspec archive` itself. Recovery covers the gap between the command and the loop's commit.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`:
  - Integration and delivery adds the changed-patch return and defines a clean checkout. It also fixes the order of `merge`-mode delivery and the precondition that the change's branch contains the default branch.
  - New requirement Integration method: merge in `pr` mode, rebase with merge on conflict in `local` and `merge` modes, the conflict handoff, and the patch comparison.
  - New requirement Delivery remote: the default branch's upstream, and the refusal without one.
  - Run control adds resume scenarios for interrupted archival and pull request creation.

## Impact

- `src/config.ts` gains `delivery`.
- `src/commands.ts`:
  - resolves the default branch's upstream when the mode needs one, and refuses without one
  - drops the fixture setup
- `src/controller.ts`:
  - the integration and delivery stages
  - the merge-concluding commit in the implementer turn
  - the change base taken from the delivery base
  - the idempotent archive stage
- `src/state.ts` gains `approvedPatch`, the patch implementation completed with.
- `src/fixture.ts` is removed.
- `src/prompts.ts`: no change. Integration findings reach the implementer through the existing findings list.
- Tests:
  - a bare local remote and a stub `gh` in the helpers
  - tests that relied on fixture stops rework to real stops
- `README.md` documents `delivery`, the upstream, integration, delivery and recovery, and drops the fixture section. The manual archive undo stays only for an interruption inside `openspec archive` itself.
