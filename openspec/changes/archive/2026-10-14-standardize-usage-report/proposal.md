# Proposal

## Why

Every worker end line and role total prints each raw counter the harness reported, such as `planReviser: 1 step; input_tokens=12, cache_creation_input_tokens=59173, cache_read_input_tokens=273751, ... iterations.0.cache_creation.ephemeral_1h_input_tokens=546, cost $0.5728622`. The line is unreadable, differs per harness, and cannot be compared across agents: Claude Code's `input_tokens` leaves out cache reads while Codex's includes them. The user wants the progress output standardized across harnesses, showing tokens and cost, with the raw detail kept where it can be inspected.

## What Changes

- **BREAKING** The usage file becomes `{ inputTokens?, outputTokens?, costUsd? }`. `inputTokens` counts every prompt token the model processed, cached or not; `outputTokens` counts every generated token, reasoning included. The `tokens` counter map is removed, and a usage file that still carries it is malformed.
- Each shipped adapter maps its harness's native usage to the two totals, following that harness's counting rules. A total whose native fields are absent is not written, so it shows as unavailable.
- Step end lines and role totals show the same three values for every harness, for example `(claude; input 332,936, output 2,234, cost $0.57)`, instead of every native counter.
- The raw usage stays in the step's transcript, which already holds the harness's full output, including every native counter. No new log or record is added.
- README: replace the native-counter tables and examples with the standard values and their definitions; custom workers write the new fields.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: Progress and usage reporting shows standard input, output and cost; the worker interface's usage file carries those standard totals; shipped adapters derive them from their harness's native usage.

## Impact

`src/step.ts` (usage format and validation), `src/controller.ts` (end line and role totals), `src/adapters/common.ts` and the four adapters (mapping; the `counters` walker goes), their tests, and the README. Custom workers that write `tokens` must switch to `inputTokens`/`outputTokens`. A run resumed across the upgrade counts its earlier steps as "without usage" in role totals, because their usage files hold the old format. No dependency, configuration, state field or auxiliary call is added.
