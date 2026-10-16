# Proposal

## Why

A supervised decision stop can leave the user being told to answer questions buried in tool output, with no recommendation or clear next action. Supervision should turn the stopped report into a self-contained decision request that the user can answer directly in chat.

## What Changes

- Require the supervisor to present every pending question together in user-facing prose, outside the unchanged report's code block, numbered and quoted exactly.
- Explain each decision in plain language, give the relevant choices and tradeoff, and recommend an answer with a reason grounded in the plan and findings.
- Invite a concise reply, including approval of all recommendations, without treating a recommendation as the user's decision.
- Honor authorization already given to record, commit and resume; ask only for actions the user has not authorized.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: Strengthen the Supervision skill requirement for actionable decision-stop handoffs while preserving user ownership of decisions and continuation.

## Impact

Update the bundled `skills/openspec-loop/SKILL.md`, its tracked `.agents/skills/` and `.claude/skills/` copies, and the README's supervision description. The controller, report format, run state, worker protocols and CLI remain unchanged.
