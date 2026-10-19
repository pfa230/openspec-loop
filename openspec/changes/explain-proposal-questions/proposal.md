# Proposal

## Why

During proposing, the agent presents short questions and option labels without enough context to make an informed choice. The user wants the decision explained, practical tradeoffs laid out, and a recommended option with a reason.

## What Changes

- Require proposal decision questions to explain the relevant context, what the answer changes, the available options and their practical tradeoffs, and the recommendation with its rationale.
- Put that explanation in user-facing prose before any compact question picker so the user can answer without opening artifacts or tool output.
- Put the guidance in `loop-propose`, applying it while the wrapper follows native proposing, both when invoked directly and through `loop-scope`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: Make decision questions during `loop-propose` self-contained and explain the recommendation.

## Impact

- Update `skills/loop-propose/SKILL.md` and refresh its project copies through existing `loop setup`.
- `loop-scope` already invokes `loop-propose`, so it inherits the guidance without a separate scoping rule. Direct native `openspec-propose` invocation outside the wrapper is outside this change.
- No runtime, question-tool schema, configuration, dependency or new automated check is needed.
