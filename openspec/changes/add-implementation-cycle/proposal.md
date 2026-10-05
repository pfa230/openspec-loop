## Why

Proposal review is real, but implementation is still a fixture, so an approved plan never becomes code. This change makes the implementation stage real. A configured implementer works through the approved plan, the configured required checks run, and a configured implementation reviewer judges the patch. Revision then repeats within the attempt budget until the patch passes or the run stops with its cause. This is build step 5 (#5).

## What Changes

- The configuration gains the `implementer` and `implementationReviewer` roles, `attempts.implementation`, and `checks`, a list of shell commands. All four are required after merging. An empty `checks` list means the run has no required checks.
- Make the `implementation` stage real. Each attempt runs one round:
  - **Implementer turn.** The implementer works in a fresh context on the native OpenSpec apply instructions and on the findings of the last round. The loop commits its work on the change's branch.
  - **Checks.** The required checks run in the run's worktree. A failing check returns its output to the implementer as a finding for the next attempt, and review waits.
  - **Review.** The implementation reviewer judges the patch against the approved plan in a separate context. The verdict follows from the findings as in proposal review. A `REVISE` starts the next attempt. An `APPROVE` with minor findings sends them to the implementer, the checks run again, and the stage completes without another review. If those checks fail, the approval lapses and the next attempt runs a full round.
  - **Questions.** A finding with a question stops the run, as in proposal review.
- When the implementer reports that the approved plan needs a change, the plan reviser revises the plan and the run returns to proposal review. The same happens when an implementer turn changes the plan beyond ticking task boxes. Implementation continues after the plan is approved again.
- Record each implementation review's verdict and findings, and identify the reviewed input by its base and candidate commits.
- The implementer prompt limits repairs to failures the change caused. A pre-existing failure stays until attempts run out.
- Resume starts with an implementer turn on the findings of the last round, with a fresh budget or the `--attempts` override.
- `LOOP_FIXTURE` shrinks to `integration`, `archive` and `delivery`.
- Every implementer turn starts a fresh context. The loop does not resume harness sessions. Evidence from #8 and #9 can justify session reuse later.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: Implementation cycle. The implementer receives the native OpenSpec apply instructions, including the repository's apply guidance. The contract states what implementation review judges and what happens when checks fail after minor fixes.

## Impact

- `src/config.ts`:
  - the two new roles
  - `attempts.implementation`
  - `checks`
- `src/controller.ts`:
  - the implementation stage
  - the return to proposal review
  - progress lines with a stage prefix
- `src/prompts.ts`:
  - the implementer prompts and reply schema
  - the implementation-review prompt
- `src/openspec.ts` reads the native apply instructions.
- `src/fixture.ts` stops naming `implementation`.
- `state.json` gains `owedFindings`, the findings record the next implementer turn must address.
- Tests:
  - stage tests use the scripted stub agent and a stub `openspec` that answers `instructions apply`
  - real harness runs are verified by hand
- `README.md` documents:
  - the new roles, attempts and checks
  - the arguments each harness needs for an editing implementer
  - the implementation stage and its recoveries
