# Proposal

## Why

The OpenCode adapter's `loop_reply` tool answers every call with "Reply recorded.", including a call with no arguments. A model that sends `{}` is told its reply went through, ends its turn, and the run then stops on a malformed reply. This happened twice in one labeler run with two different models: `muse-spark-1.3-contributor` in plan fixes and `xiaomi/mimo-v2.6-flash` in implementation. The failure belongs to the loop's own tool, not to the models.

## What Changes

- The `loop_reply` tool rejects a call that omits a required top-level property of the worker schema with an error naming the missing properties. The call does not complete, so it cannot supply the reply, and the model receives the error inside its turn and can call the tool again.
- A call that has every required property is still recorded as before; the loop's reply validation remains the check of the written arguments, so other schema violations stay execution failures.
- README describes the rejection.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: the Shipped adapters requirement adds the reply tool's rejection of calls missing required properties and splits the schema-violation scenario into the rejected case and the still-validated case.

## Impact

- `src/adapters/opencode.ts`: the generated `loop_reply.js` tool checks its arguments.
- `test/adapters.test.ts`: the tool test covers a complete and an incomplete call.
- `README.md`: the OpenCode adapter paragraph.
