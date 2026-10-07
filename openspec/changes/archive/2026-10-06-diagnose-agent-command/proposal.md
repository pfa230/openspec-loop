## Why

When a worker fails with an error that does not name its cause, the supervision skill cannot find a cause in the agent's own command, such as a model that does not exist. The report names the agent only by its alias, and the skill's diagnosis does not read the configuration that holds the command. In run C of #9, an agent `[loop-opencode, -m, openrouter/no-such/model]` failed with only `Unexpected server error`, and neither a Claude nor a Codex session looked at its command (#29).

## What Changes

- **Diagnosing a worker's execution failure reads the failing agent's command** from `openspec/loop.yaml` and `openspec/loop.local.yaml`, and checks its arguments, such as the model, against the error. Diagnosis stays read-only.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: The Supervision skill requirement adds the failing agent's configured command to what a diagnosis reads.

## Impact

- `skills/openspec-loop/SKILL.md`: the "Diagnosing a stop" section.
