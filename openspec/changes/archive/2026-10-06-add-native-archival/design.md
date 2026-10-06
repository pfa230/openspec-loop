## Context

The controller (`src/controller.ts`) runs `proposal-review` and `implementation` as real stages, and `integration`, `archive` and `delivery` as `LOOP_FIXTURE` shell commands. Proposal review stores the approved plan's digest in `state.json` as `approvedPlan`. `advance()` compares it with the current plan at the top of every stage, and `implementerTurn()` compares it again after each turn. On a mismatch, `reopenPlan()` resets every stage and the run returns to proposal review. `reopenPlan()` also serves the reported `planProblem` path. See proposal.md for why the staleness use goes.

`openspec archive <change> --yes` (checked with OpenSpec 1.14.0):

- **Valid change.** It validates the change, applies the spec deltas to `openspec/specs/`, moves the change to `openspec/changes/archive/<YYYY-MM-DD>-<change>/` and exits 0. Unticked tasks and a change without deltas only print warnings.
- **Refused change.** When a spec delta fails validation or cannot be applied to its main spec, it prints the errors, changes no file and exits 1. Proposal issues, such as a short `## Why`, are warnings that do not block.
- **Repeated archive.** Run again after a successful archive, it exits 1 with `Change '<change>' not found`.

## Goals / Non-Goals

**Goals:**
- A run that passes implementation ends with its archive committed on the change's branch.
- Plan edits are handled only where a run makes them: the plan reviser's revisions go to review, and the implementer's own edits stop the run.

**Non-Goals:**
- Recovery from an interruption between `openspec archive` and the loop's commit (#7). Resume then reruns `openspec archive`, which exits 1 because the change has moved, and the run stops naming the transcript.
- A separate `openspec validate` step. The archive command already validates, and a second run would duplicate it.
- Sending a refused archive back to the plan reviser. A delta that fails validation got past proposal review, and the run stops so the user sees it.
- Migrating `state.json` from older runs. An `approvedPlan` field left in an old state file is ignored and written back unchanged. The loop is unreleased (#10).

## Decisions

**The archive stage.** The stage runs `openspec archive <change> --yes` in the run's worktree through the existing step runner. The output goes to `NNN-archive.log`, stdin is closed, and `loop stop` ends the step's process group. Every outcome falls out of the exit:

| Exit | Outcome |
|---|---|
| 0 | The loop runs `git add --all`, commits `<change>: archive`, and prints the short hash. |
| Nonzero, or a signal `loop stop` did not cause | The run stops at `archive`. The cause names the command, the exit status or signal, and the transcript. The recovery tells the user to fix the change in the run's worktree, commit it on the run's branch, and run `loop resume <change>`. Nothing is committed. |
| `openspec` cannot be spawned | An execution failure of the loop, as for any step. |

The whole worktree is committed, as after an implementer turn, because the run's worktree holds only the run's work: enrollment refuses a dirty worktree and a loop-created one starts clean. Anything else in it got there by hand while the run was stopped, which is the person's responsibility. `--yes` skips OpenSpec's confirmation prompt, which an unattended run cannot answer. The loop passes no `--skip-specs` or `--no-validate`, so OpenSpec's own rules, including `skip_specs` in a change's `.openspec.yaml`, decide what archiving does.

Progress lines:

```
[10:09:30] archive: started
[10:09:31] archive: committed 4f5e6d7
[10:09:31] archive: complete
```

A refusal prints `archive: openspec archive failed, exit status 1`. `advance()` prints `<stage>: complete` without `(fixture)` for every stage outside the fixture list, instead of naming the two real stages.

**The implementer's plan check is local to one turn.** `implementerTurn()` digests the plan with the existing `planDigest()` before it starts the worker. After the loop commits the turn, it digests the plan again. If the digests differ, the turn returns a halt, and the run stops at `implementation`:

```
implementation: attempt 1 of 3, implementer changed the plan (opus)
Cause: failure of implementer agent "opus": it changed the plan beyond ticking task boxes in commit 1a2b3c4
Recovery: revert the plan changes of 1a2b3c4 in worktree <worktree> on branch <branch>, then run `loop resume <change>`
```

The check runs before the `planProblem` branch, so a turn that reports a problem and also edits the plan still stops. It covers implementer and minor-fix turns alike, since both run through `implementerTurn()`. `planDigest()` keeps its tick normalization: ticking boxes is the implementer's job, and a tick must not trip the check.

Alternatives considered:

- **Keep `approvedPlan` and compare against it.** That needs a state field, and the comparison would also catch edits made by hand, which this change stops reacting to.
- **Store the "before" digest in state** to cover a turn interrupted mid-edit. That costs a field and a write for a case where the agent has already broken its contract and the run was interrupted on that same turn. The limit is stated in the contract instead.

**Stage boundaries no longer check the plan.** The `planChanged()` block at the top of `advance()` goes, along with `planChanged()` itself and the post-turn comparison with `approvedPlan`. Nothing reads the change directory between stages any more, so archival moving it cannot break a resume.

**`reopenPlan()` stays for the two returns the loop itself decides.**

- **A reported `planProblem`.** It works as #5 built it, minus the `state.approvedPlan = null` line.
- **An implementation-review finding with a question.** `implementation()` calls `reopenPlan()` and writes state before returning the decision stop. Resume then starts at proposal review, which reviews the decision the user recorded, as the contract's "Decision needed" scenario requires. Before this change, the boundary check produced the same effect by detecting the user's edit. Now the reset happens because the loop asked the question. A resume without a recorded decision also goes to proposal review, which reviews the unchanged plan and may ask again. A proposal-review decision stop needs nothing, because that stage is still pending when it stops.

**Records drop the plan digest.** Proposal-review verdict records and `NNN-plan-problem.json` lose their `plan` field, which existed only for the staleness comparison. Implementation-review records keep `base` and `commit`. They identify each attempt's candidate, which the supervision skill needs to compare attempts.

**Fixtures shrink to two stages.** `FIXTURE_STAGES` excludes `archive`, so `LOOP_FIXTURE` must name `integration` and `delivery`, and reports read "Stages integration and delivery were fixtures and did no real work." An `archive` key left in a fixture file is ignored, as unknown keys already are.

**Tests use a stub `openspec archive`.** The test `openspec` stub gains an `archive` branch. By default it moves `openspec/changes/<change>` to `openspec/changes/archive/2026-01-01-<change>`, prints OpenSpec's success line and exits 0. When a marker file in the test directory exists, it prints a validation error and exits 1. The tests check the loop's side of the contract: the command it runs, the commit, the stop and the recovery. Real archival, including the spec deltas applied to a main spec, is verified once by hand in a disposable repository. That is the same approach the harness adapters already use, and it avoids a dev dependency on OpenSpec that would only re-test OpenSpec.

## Risks / Trade-offs

- **[A plan edit by an interrupted implementer turn goes undetected]** → Accepted and stated in the contract. Resume redoes the turn, and the edit shows in the patch the implementation reviewer reads.
- **[A hand edit while stopped is no longer reviewed]** → This is intended (proposal.md). The README says so in its proposal-review and implementation sections.
- **[A stop or crash between `openspec archive` and the commit leaves the change half archived]** → Resume stops with OpenSpec's `not found` message. Archiving takes about a second, and #7 adds inspection of completed effects.
