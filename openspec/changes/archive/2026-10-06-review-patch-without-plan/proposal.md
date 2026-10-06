## Why

The implementation reviewer reviews `git diff <change base> <candidate>`, which holds every plan change committed on the run's branch: the proposal itself when it was committed on its own branch, the plan reviser's revisions and minor plan fixes, and decisions the user records on the branch after a decision stop. The reviewer judges those approved plan changes as the implementer's edits and can ask for them to be reverted. The implementer applies that fix, changes the plan, and the run stops as an implementer failure. The printed recovery reruns the same owed finding, so the run cannot complete (#27, run D of #9).

## What Changes

- **The change's patch leaves out the change's directory.** It is the difference from the commit the change branches from on the base, outside `openspec/changes/<change>/`. The plan and its task completion marks live there, and the implementer cannot change the plan without stopping the run, so nothing the implementer is judged on is left out.
- **The implementation reviewer reviews that patch.** Its prompt gives the diff with the change's directory excluded and says the approved plan is not under review.
- **Integration compares that patch.** The approved patch recorded at implementation's completion, and the one integration compares it with, both leave out the change's directory. One definition of the patch serves the review and the comparison. As a result, a plan edited by hand while the run is stopped at integration no longer reads as a changed patch.

Not in this change:

- A different recovery for an implementer turn that changes the plan. It stays a hard failure. This change removes the cause seen in run D.
- The implementer's prompt. Its `git diff <base>` shows the work so far, plan files included, and it judges nothing there.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: Reviews and verdicts defines the change's patch as the change's work outside its change directory, and adds a scenario for a plan revised before implementation.

## Impact

- `src/plan.ts`: a pathspec that excludes the change's directory.
- `src/git.ts`: `patchId()` takes that pathspec.
- `src/controller.ts`: the two `patchId()` calls and the implementation review prompt pass it.
- `src/prompts.ts`: the implementation review prompt's diff and its note on the plan.
- Tests: one stub-agent test runs the review prompt's diff after minor plan fixes; `patchIdOf()` in `test/helpers.ts` leaves out the change's directory.
- `README.md`: the review and the changed-patch rule say what the patch covers.
