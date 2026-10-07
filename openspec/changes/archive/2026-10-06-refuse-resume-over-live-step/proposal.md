## Why

Every step runs in its own process group, which the advancing process kills when it is stopped. When that process is killed with SIGKILL, for example by `kill -9` or the OOM killer, no handler runs and the step's group keeps running in the run's worktree. `loop resume` then takes the run over and redoes the step beside the old one, so two workers edit one worktree and the orphan's usage file lands in the run's totals (#28, run D of #9).

## What Changes

- **The run records the running step's process group.** When a step starts, its process group ID is written into the run's state, replacing the previous step's.
- **Resume refuses to take over while that group is alive.** It names the group and the dead process, and says to end the group or wait for it to exit, then resume. The lock stays with the dead process, so `loop status` keeps reporting the run as interrupted by it, and the resume that follows reports the takeover as today.
- **Resume never kills the group.** A group ID reused since the crash would then kill an unrelated process group; refusing costs at most a refusal the user can check.

Not in this change:

- `loop status` and `loop stop` for a dead advancement's live step. Status keeps reporting the run as interrupted; resume names the group when it refuses.
- Processes a step leaves running after its leader exits. The next step starts beside them without any process dying, so a takeover check cannot address them.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: Run control refuses a takeover while a step of the dead advancement is still running, and adds a scenario for it.

## Impact

- `src/step.ts`: a step exposes its process group ID.
- `src/state.ts`: a `stepGroup` field in the run state, a group liveness check, and the refusal in `acquireLock()`.
- `src/controller.ts`: `exec()` records the step's group in the state when the step starts.
- `src/commands.ts`: `enroll()` creates the run with no step group.
- Tests: one control test SIGKILLs the controller alone, checks the refusal, ends the group and resumes.
- `README.md`: the takeover paragraph says when resume refuses and how to proceed.
