# Proposal

## Why

During proposing, the agent presents short questions and option labels without enough context to make an informed choice. The user wants the decision explained, practical tradeoffs laid out, and a recommended option with a reason.

## What Changes

- Require proposal decision questions to explain the relevant context, what the answer changes, the available options and their practical tradeoffs, and the recommendation with its rationale.
- Put that explanation in user-facing prose before any compact question picker so the user can answer without opening artifacts or tool output.
- Apply this guidance to native proposing in this repository and to the bundled scoping workflow, including questions raised while native proposing is running.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: Make attended proposal decision questions self-contained and explain the recommendation.

## Impact

- Add proposal-question guidance to repository `AGENTS.md` and `skills/openspec-scope/SKILL.md`; refresh the bundled scoping copies through existing `loop setup`.
- Keep native OpenSpec's generated proposing instructions intact; repository instructions cover direct proposing here, while the bundled skill covers scoping in other projects.
- No runtime, question-tool schema, configuration, dependency or new automated check is needed.
