## Why

Archival is still a fixture, so a reviewed and checked change never reaches OpenSpec's archive. This change makes the archive stage real through native `openspec archive`. This is build step 6 (#6).

Real archival moves the change directory, and the loop's plan-staleness check reads that directory at every stage boundary, so a resume after archival would crash. That check exists to re-review a plan edited after its approval. Inside a run, only two kinds of turn write the plan. The plan reviser's revisions always go to proposal review next. An implementer that edits the plan breaks its instructions, and that is a failure, not a revision route. The remaining case is an edit a person makes by hand, which is the person's responsibility. This change therefore replaces the staleness machinery with one check inside the implementer turn, which stops the run instead of reviewing again.

#6 also asked for a pre-archive gate that blocks on incomplete or stale stages. Stages run in order, so an incomplete stage can never reach archival. With no stale approvals left to track, the gate has nothing to check, and this change does not add one.

## What Changes

- **The archive stage is real.** It runs `openspec archive <change> --yes` in the run's worktree, which validates the change natively and applies its spec deltas. The loop commits the result on the change's branch as `<change>: archive`. A nonzero exit stops the run, names the transcript, and commits nothing.
- **An implementer that edits the plan stops the run.** The loop digests the plan before and after each implementer turn. If they differ beyond task completion marks, the run stops, naming the commit. This replaces #5's return to proposal review for such an edit. A reported `planProblem` still goes through the plan reviser and proposal review.
- **Removed: plan staleness.** This covers `approvedPlan` in `state.json`, the plan check at every stage boundary and its reopening of stages, and the plan digest in review records. An edit made by hand while a run is stopped no longer sends the plan back to review.
- **A decision stop in implementation review reopens the plan when it stops.** The resumed run reviews the recorded decision in proposal review first, as before. It no longer relies on detecting the edit.
- **`LOOP_FIXTURE` shrinks to `integration` and `delivery`.**

Not in this change:

- Recovery from an interruption between `openspec archive` and its commit (#7). Resume reruns `openspec archive`, which then fails because the change has moved, and the run stops with OpenSpec's message.
- Any check on edits after archival, including before delivery. Only a person can make them.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`:
  - Pre-archive gate and native archival becomes Native archival.
  - Run control drops the rule that a stage is complete only while its result applies to the current inputs.
  - Reviews and verdicts drops the requirement that verdicts identify their inputs for later comparison.
  - Autonomous plan revision makes an implementer's own plan edit a hard failure.
  - Minimal by design no longer promises approval checks for manual work.
  - Integration and delivery integrates before archival instead of before the removed gate.

## Impact

- `src/controller.ts`:
  - the archive stage
  - the plan check inside the implementer turn
  - removal of the boundary check
  - the reopened plan on an implementation-review decision stop
- `src/state.ts` drops `approvedPlan`.
- `src/fixture.ts` stops naming `archive`.
- Tests:
  - the stub `openspec` answers `archive`
  - staleness tests are removed or reworked
  - real archival is verified by hand
- `README.md` documents the archive stage, the hard failure, and the removed re-review of edited plans.
