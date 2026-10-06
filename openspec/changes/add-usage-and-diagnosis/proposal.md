## Why

A run spends money on every worker turn, and today the loop shows none of it: the contract already requires usage and cost on each worker step's end line, but no adapter captures them and no report totals them. When a run stops, the supervision skill only relays the report, although the contract asks it to diagnose the stop with the user. This is build step 8 (#8).

## What Changes

- **A fourth worker path, the usage file.** The loop appends a usage file path after the prompt, schema and reply paths. A worker may write the step's usage there: token counters named as its harness names them, and a cost in US dollars. A worker that writes no usage file has no usage for that step. A usage file that is not such an object is an execution failure, like a malformed reply. **BREAKING** for custom adapters that take the last three arguments as their paths.
- **The shipped adapters write usage.** Each adapter writes the counters and cost its harness reports, and nothing it does not report:
  - Claude Code reports tokens and cost.
  - Codex and Antigravity report tokens only.
  - OpenCode reports tokens and cost per model step, which the adapter sums.
  - An adapter writes the usage file before it judges the harness's exit, so a failed turn that reported usage still counts.
- **Each worker step's end line shows its usage and cost**, including a step that ends in an execution failure. A value the harness did not report reads `unavailable`, never zero.
- **The report totals usage by role.** The completed and stopped reports sum each role's counters and cost over every worker step of the run, across every resume, and say how many of a role's steps reported no usage or no cost.
- **A worker's execution failure names its step.** The stop cause names the step, such as `attempt 2 of 3, implementer`, beside the agent, the exit status and the transcript.
- **The supervision skill diagnoses a stop with the user.** It reads the report, the named transcript, the review and check findings records and the diffs between attempts, then states the likely cause, the evidence that is missing, why attempts did not converge, and a recovery. It changes nothing while diagnosing, and repairs or resumes only when the user agrees.

Not in this change:

- Per-attempt subtotals in the report, which #8's scope suggested. Each step's end line already carries its usage within its attempt, so a subtotal would aggregate the same figures a second time.
- A run-wide token total. Counters of different harnesses carry different names and meanings, and the loop does not convert between them.
- Usage in `loop status`. The report carries the totals.
- Usage of steps that are not worker turns, such as required checks, Git commands and `openspec archive`.
- Any investigation by the loop itself. The loop reports what it observed; diagnosis belongs to the skill and the user.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`:
  - Worker interface adds the usage file and its failure rule.
  - Shipped adapters write the usage their harness reports.
  - Progress and usage reporting adds usage on failed steps, the totals by role and the step named in a worker's execution failure.
  - Supervision skill states what the diagnosis covers, including execution failures and missing evidence, and that the skill changes nothing while diagnosing.

## Impact

- `src/adapters/common.ts`: the fourth path, and `runHarness()` writes usage before it judges the exit.
- `src/adapters/{claude,codex,agy,opencode}.ts`: each extracts its harness's usage.
- `src/step.ts`: `startWorker()` appends the usage path, and a reader checks the usage file.
- `src/controller.ts`: worker end lines carry usage, the execution failure names the step, and both reports print the totals by role.
- Tests: the stub agent takes four paths and can write usage; adapter tests check usage from the recordings.
- `skills/openspec-loop/SKILL.md` gains a section on diagnosing a stop.
- `README.md` documents the fourth path, the usage file, each adapter's counters and the report's totals.
