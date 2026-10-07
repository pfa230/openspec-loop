## Why

A supervising Claude Code session showed the run's report with the two leading spaces stripped from each `Usage by role` line (#39), so the user did not see the report as the loop printed it. The session did not retype it wrong: Claude Code's Monitor drops each line's leading whitespace before the session sees the event. In the #10 exercise, `loop.log` holds `  proposalReviewer: 2 steps; ...`, while the Monitor event in the session's transcript, and the session's reply copied from it, hold `proposalReviewer: 2 steps; ...`. A Monitor on `printf 'top\n  two-spaces\n    four-spaces\n\ttab\n'` delivers all four lines flush left, while the same `printf` through Bash keeps the spaces and the tab.

## What Changes

- **In Claude Code, the skill shows the report from a Bash read of the log.** Monitor events relay the progress lines, which start with the time and carry no leading whitespace. The first line that does not start with the time ends that relay; the skill shows it and every later line from the Bash read of the log it already makes when the command exits. That covers the report and anything else after the progress, such as a refusal or the usage text, and every indented line in them, not only the usage block: the decision questions under a decision stop's cause, and any indented command output a cause quotes.

Not in this change:

- Removing the indentation from the loop's report. It would fix the usage lines and the decision questions, but not indented output that a stop's cause quotes from a failed command, and the skill's report would still pass through a channel that alters it.
- The Codex path. `exec_command` output is the command's own output and is not reported to lose whitespace.
- Firmer wording about copying the report unchanged. The session copied what it received exactly; the loss happened before it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The Supervision skill requirement already says the user sees the report as the loop printed it; the skill fails it in Claude Code, and this change makes the skill meet it. The change sets `skip_specs: true`.

## Impact

- `skills/openspec-loop/SKILL.md`: steps 2 and 3 under "Watching a run in Claude Code".
