## Why

A supervising session may summarize a run's report instead of showing it, so the user never sees parts of it, such as the `Usage by role` block (#30, run A of #9). The skill requires progress lines to be relayed "in order and unchanged", but says only "show the user the report" for the report, and a summary satisfies that wording.

## What Changes

- **The skill shows the report unchanged, in a code block.** The Rules bullet for a command's exit says so. A code block keeps the report's lines apart, which Markdown would otherwise join into one paragraph.

Not in this change:

- An instruction to override a session's own brevity rules. In run A the same session relayed every progress line unchanged under the same rules, so "unchanged" alone held there; the brevity rules as a cause of the summary are an untested inference.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: the Supervision skill requirement adds that the skill shows the user the report unchanged, with a scenario for it.

## Impact

- `skills/openspec-loop/SKILL.md`: the exit rule under Rules.
