## Context

`advance()` in `src/controller.ts` runs the first stage of `STAGES` whose entry in `state.stages` is not `complete`. `resume()` in `src/commands.ts` takes the run's lock, reads the state and calls `advance()`; `src/cli.ts` accepts `--attempts <n>` only after `resume <change>`. Implementation reopens today only through `reopenImplementation()` after integration and `reopenPlan()` after a plan problem or a decision stop. See proposal.md for the gap.

`complete()` clears `owedFindings` in the same state write that marks implementation complete, and only `reopenImplementation()` and the implementation stage set it again, both with implementation pending. So while implementation is complete, `owedFindings` is null. `owedReview` is set only while proposal review is pending. `approvedPatch` is rewritten by `complete()` when implementation completes again.

`implementerPrompt()` with no findings asks the implementer to implement the approved plan and says that `git diff <base>` shows the work so far, which may already complete some tasks. That fits a reopened implementation as it stands.

## Goals / Non-Goals

**Goals:**
- A user who edited the plan of a run past implementation sends it back to the implementer with one resume.

**Non-Goals:**
- Detecting plan edits, or reopening implementation without the flag. The issue rules this out; the user decides.
- Reviewing the edited plan. The user made the edit, and the contract leaves verifying manual work to the person who did it.
- Reopening implementation after archival. Un-archiving a change is the user's work, and discarding the run and starting over stays available.
- A progress line for the reopening. The next line, `implementation: attempt 1 of <n>, implementer started (<agent>)`, already shows where the run continues.

## Decisions

**The flag only marks stages pending.** `resume()` sets `implementation`, `integration`, `archive` and `delivery` to `pending` under the lock, then calls `advance()`, whose first write persists them before any stage starts. It touches nothing else in the state:
- `proposal-review` stays as it is, so an incomplete proposal review runs first and the flag cannot skip it.
- `owedFindings` needs no drop, unlike the issue's sketch: it is already null whenever implementation is complete, and when implementation is incomplete, the findings it names are work the implementer still owes, such as a conflicted merge in progress, which dropping them would hide.
- `approvedPatch` is replaced when the reopened implementation completes.

When implementation is already incomplete, the flag therefore changes nothing, and the resume runs as a plain one. Alternatives considered:
- **Refuse the flag while implementation is incomplete.** It adds a refusal for a request whose effect already holds.
- **A new state field asking the controller to reopen.** The stage map already says what runs next; a field would duplicate it.

**The reopening happens in `resume()`, after the lock and before `advance()`.** The lock guarantees no advancement is active while the state changes, and every refusal in `resume()` comes before the state changes. Doing it inside `advance()` would give the controller a resume-only input for a one-time edit.

**Refuse once the change has left its directory.** `resume()` refuses `--implement` when `openspec/changes/<change>/` is missing from the run's worktree, the same test `archive()` uses to see that OpenSpec already archived the change: `<change> is archived in worktree <worktree>; \`--implement\` reopens implementation only before archival`. It releases the lock and leaves the state as it was. The test covers a completed run and a run interrupted after OpenSpec moved the change but before the archive stage completed, and the tests exercise the second; a check of `state.stages.archive` would miss the second. Without the refusal, the reopened implementation would ask OpenSpec for apply instructions of a change it cannot find, stop with an execution failure of the loop, and leave the run with archive pending over an archived change. A run stopped at archival because OpenSpec refused still has its change in place, so the flag works there.

**The CLI accepts `--implement` and `--attempts <n>` in either order, each at most once, on `resume` only.** Anything else prints the usage and exits 2, as today. `resume(change, attempts, implement)` gains the flag as a third parameter.

## Risks / Trade-offs

- **[A plan edit left uncommitted]** → The implementer turn commits it with its own work, as for any uncommitted change in the run's worktree, and the plan comparison around the turn sees the same plan before and after. The README tells the user to commit the edit on the run's branch first.
- **[A rebase left in progress by a controller killed with SIGKILL during integration]** → Only integration aborts an unfinished rebase, and the reopened implementation runs before it, so the implementer turn would commit onto the rebase's detached HEAD. A plain resume redoes integration and is unaffected. The window is a synchronous `git rebase` inside a SIGKILL, so this change does not guard it.
