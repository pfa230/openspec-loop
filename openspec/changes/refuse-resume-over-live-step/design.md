## Context

`runStep()` in `src/step.ts` spawns every step with `detached: true`, so the step leads its own process group, and `kill()` sends SIGKILL to that group. `advance()` in `src/controller.ts` runs every step through `exec()`, which holds it as `current` so the SIGTERM, SIGINT and SIGHUP handlers can kill it. Workers, required checks, `git fetch`, `git push`, `gh` and `openspec archive` all pass through `exec()`.

The lock file holds the advancing process's PID. `acquireLock()` in `src/state.ts` refuses while that PID is alive; when it is dead, it unlinks the lock, links its own, and returns the dead PID, which `resume()` reports as `took over run <change> from process <pid>, which died`. `loop status` reports a dead holder as `interrupted ... ; process <pid> died`. See proposal.md for the failure.

## Goals / Non-Goals

**Goals:**
- No step of a dead advancement is still running when a takeover redoes it.

**Non-Goals:**
- Telling a live orphan group apart from an unrelated group that reused its ID. A false refusal names the group; the user checks it with `pgrep -l -g <group>` and ends it or waits.
- Processes a step leaves running after its leader exits. `runStep()` resolves on the leader's exit, so the next step starts beside them within the same advancement, with no process dying; the takeover check cannot fix that, and this change does not address it.
- Changing `loop status` or `loop stop`. Status keeps saying the run was interrupted and names the dead process; the refusal tells the user what remains.

## Decisions

**The step's group in the run state.** `RunState` gains `stepGroup: number | null`, null when `enroll()` creates the run. `exec()` sets it to the step's process group ID and calls `writeState()` when the step starts, replacing the previous step's. `Step` gains `group: number | undefined`, the spawned child's PID; it is undefined when the spawn fails, as for a missing `gh`, and then `exec()` leaves the state alone. `writeState()` already writes atomically, so a reader never sees a partial record.

The write happens inside `exec()`'s `try`, after `current` is set, and a `catch` kills the step with `step.kill()` before rethrowing. Without it, a failed write, such as on a full disk, would stop the run and release the lock while the step runs on unrecorded, and the next resume would start beside it. The `catch` also sees a failed spawn, for which `kill()` already does nothing.

The field is not cleared when a step ends. A field naming an ended step's group names a dead group, which the check passes; clearing it would only guard against that ID being reused before a later takeover, and the cost of such reuse is a refusal that names the group.

The write at a step's start persists the whole in-memory state. Every mutation of the state in `src/controller.ts` is written before the next step starts, so this writes nothing early.

Alternatives considered:
- **A file of its own in the run directory.** It needs its own read and write functions for what `state.json` already persists.
- **The group ID in the lock file.** The lock is linked into place once, holding the PID, so no reader ever sees it empty. Rewriting it for every step would give up that guarantee or add a second write protocol.

**The check sits in `acquireLock()`, before it unlinks a dead holder's lock.** When the holder is dead and `readState()` gives a `stepGroup` that is alive, `acquireLock()` throws a `Refusal`: `run <change> has a step still running in process group <group>, started by process <pid>, which died; end it with \`kill -- -<group>\` or wait for it to exit, then run \`loop resume <change>\``. The CLI prints it and exits 2. The dead holder's lock stays in place, so `loop status` keeps naming the dead process and the resume that follows reports the takeover. A check after the lock is taken would have to release the lock and lose the dead PID, and a check before `acquireLock()` would also fire on a live advancement's own step.

Group liveness is `process.kill(-group, 0)`: alive unless it throws `ESRCH`, as `isAlive()` treats `EPERM`. Like `isAlive()`, it treats anything but a positive integer as dead, so a null field, or one missing from a run started before this change, never signals the loop's own group through `kill(0, 0)`. A group stays alive while any of its processes runs, so a controller killed while a wrapper's leader has exited and its harness still runs is covered. A group whose processes have all exited but are not yet reaped still reads as alive (checked on Linux: `kill(-group, 0)` succeeds until the last one is reaped), so a resume given the instant the group is killed can be refused once more.

**Resume never kills the group.** Issue #28 names two remedies, and this is the decided one. SIGKILL on takeover would need no manual step, but a group ID reused since the crash would kill an unrelated process group.

## Risks / Trade-offs

- **[A process that dies between `spawn` and the state write leaves its step unrecorded]** → The window is one synchronous write after `spawn()` returns, and resume then takes over beside that step. The amended Run control states this boundary next to the rule, as the contract does for a turn interrupted before the loop compares the plan.
- **[A false refusal after group ID reuse]** → The refusal names the group, so the user can see with `pgrep -l -g <group>` that it is unrelated and set `stepGroup` to `null` in `state.json` by hand. `loop status` names the run directory.
