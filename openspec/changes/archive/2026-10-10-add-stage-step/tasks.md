# Tasks

## 1. Shared stage-bounded command

- [x] 1.1 Add `step` dispatch and usage in `src/cli.ts`, a command in `src/commands.ts` using existing preparation/enrollment/loading/locking helpers, and an invocation-only limit in `src/controller.ts::advance`; verify with existing stub fixtures that first step completes proposal review without implementation, both default-branch and own-branch enrollment work, and extra step arguments are refused.
- [x] 1.2 Extend existing enrollment, prerequisite and control tests to exercise `step` for committed-proposal and dirty-worktree refusals, invalid configuration/roles/check-list/OpenSpec/upstream prerequisites, configuration rereading, and lock refusal across run/resume/step; verify refused calls advance no stage and successful continuation keeps the enrolled worktree.
- [x] 1.3 Add a README command row and a short staged-inspection example alongside the implementation of the command; verify its documented syntax and exit statuses agree with CLI tests and its ordinary continuation uses `resume`, retaining `run`'s already-enrolled refusal.

## 2. Boundary reporting and continuation

- [x] 2.1 Print the successful boundary report using existing locations and cumulative usage, and derive boundary status in `src/commands.ts` from the existing state and lock; verify successive calls complete exactly the five stages in order, reports/status name the next stage and continuation commands, the lock is released, and final delivery or an already-completed run reports completion without replay.
- [x] 2.2 Extend controller/report tests for step followed by ordinary resume and for proposal revisions/minor fixes and implementation revisions/checks/minor fixes inside a single stepped stage; verify completed work is preserved and not rerun, transcript numbering and usage totals accumulate across calls, budgets remain bounded, and ordinary run/resume still advance through all stages.
- [x] 2.3 Update README report/continuation explanations and the shipped supervision skill to forward step output and await explicit continuation at a successful boundary; verify both documents distinguish a boundary from a failure and whole-run completion, preserve stop diagnosis/agreement rules, and name only supported options.

## 3. Existing recovery under step

- [x] 3.1 Extend existing scripted stage/integration tests for implementation-to-proposal-review and integration-to-implementation handoffs; verify each step follows the existing handoff until the first subsequent successful stage completion and returns with the reopened stage next, retaining findings, commits and attempt accounting.
- [x] 3.2 Extend existing stage/control fixtures for failure, exhausted attempts, a decision question, user stop, dead-controller takeover and a surviving worker group; verify step retains halt/refusal exit statuses and reports, status never calls an interrupted run a successful boundary, and explicit step/resume recovers with fresh configured budgets without replaying completed work.

## 4. Integrated validation

- [x] 4.1 Run `npm test` and `openspec validate add-stage-step --strict`, then perform the repository-required cut pass against the amended contract; verify the full suite passes, artifacts validate and every kept mechanism/task serves issue #43 or the contract without adding state fields, configuration keys or a second execution path.
