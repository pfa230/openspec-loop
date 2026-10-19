## Context

See proposal.md for motivation. `advance()` selects the first incomplete stage from `state.stages`. `resume --implement` marks implementation and later stages pending while preserving proposal approval. `reopenPlan()` already reopens all stages and clears implementation findings when an implementer reports a plan problem or a reviewer asks a decision question.

Proposal review first services `state.owedReview`, which may name a revision or minor-fix turn left unfinished by a stop. Reusing that record after a supervisor edit would revise the new plan against an older review before reviewing it.

## Goals / Non-Goals

The design uses the existing stage map and review cycle. It adds no plan-change detector, approval digest, run-state schema or independent supervisor review process. Plain resume and `--implement` retain their existing semantics.

## Decisions

### Explicit resume option under the existing lock

Add `--review` to resume parsing alongside the existing options and four role aliases. Under the run lock, before `advance()`, require the change directory to exist using the same pre-archival check as `--implement`, then reopen every stage. Reuse the existing plan-reopening operation rather than duplicate its stage reset. Clear `owedReview` for this explicit restart as well as the implementation findings that `reopenPlan()` already drops: the first worker must review the current plan, not perform a revision owed to its previous version. Existing work, commits and transcripts stay in place. Implementation completion replaces `approvedPatch` as it does today.

`--review` can be combined with `--attempts` and role aliases as usual. If `--implement` is also present, review still runs first because reopening every stage already includes implementation; no combination refusal is needed. Keep the existing at-most-once parsing convention for each option.

An explicit command is necessary because neither plain resume nor `--implement` resets completed proposal review. Editing `state.json` from the supervisor would bypass the loop's command interface and locking. Starting a separate run would discard the existing run's progression rather than reopening it.

### Supervisor chooses review after its plan edits

Update the shipped supervision skill's command reference and recovery instructions to commit its plan edits and use `--review` for the next advancement, including a plan edit made after implementation completed. This replaces the instruction to use `--implement` for that recovery. Existing instructions about user-requested stops, stage boundaries and decisions still govern whether the agent may continue. Update the README's approval and supervision guidance to explain the distinction between manual command behavior and the supervisor's recovery obligation.

## Risks / Trade-offs

- An old owed proposal revision could run ahead of the new review if only stage flags were reset. Exercise the restart from that existing stopped state as well as a run stopped during implementation and a run past implementation.
- After archival the plan directory no longer exists. Reuse `--implement`'s directory-based refusal, including the interval after OpenSpec moves the change but before the archive stage is marked complete; checking only the stage flag would admit an unusable restart.
- Supervisors using an older installed skill retain the old instructions. Refresh bundled copies with the existing `loop setup` workflow when deploying the implementation; this proposal introduces no new installer behavior.
