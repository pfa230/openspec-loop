# Proposal

## Why

A proposal that leaves too much open, or fixes too much, can make the proposal reviewer or the plan reviser stop the run. The supervising session then diagnoses the stop and waits for the user, although it has everything it needs to fix the plan and resume. The Supervision skill requires that wait: it repairs or continues only with the user's agreement. A supervisor should wait only for questions it cannot answer, and otherwise drive the run to delivery.

## What Changes

- After diagnosing a stop, the supervisor applies the recovery itself and resumes, without asking. Its recoveries are edits to the change's plan committed on the run's branch and the loop's resume commands.
- The supervisor hands a stop to the user only when none of those recoveries addresses its cause without a decision that neither the user's instructions, the source issue, the plan nor the repository's rules settle. Fixing the environment, credentials, quota, the main checkout or the remote, and discarding the run, stay with the user. It also hands over a stop that repeats a cause it already recovered from.
- For a decision stop, the supervisor answers each question that the recorded context settles, records it in the design and resumes. It hands only the open questions to the user, in the existing numbered handoff. The user's answers authorize recording, committing and resuming.
- Unchanged: a stop the user requested stays stopped, and a successful `loop step` stage boundary still waits for the user. Diagnosis stays read-only.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: The Supervision skill requirement lets the supervisor recover and resume a stopped run on its own, and limits waiting to stops that need the user. The Controller ownership requirement's supervised-run scenario and the Autonomous plan revision requirement stop saying that only the user continues a run or records a decision.

## Impact

Update the bundled `skills/openspec-loop/SKILL.md`, its tracked `.agents/skills/` and `.claude/skills/` copies, and the README's supervision description. The controller, report format, run state, worker protocols and CLI stay unchanged.
