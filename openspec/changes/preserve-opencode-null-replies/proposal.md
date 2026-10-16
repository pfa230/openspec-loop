# Proposal

## Why

MiMo's implementation reply repeatedly reaches `loop_reply` as `{}` even though its text names `planProblem: null`, so the required-property guard rejects it until OpenCode's repeat-call guard ends the worker. A direct OpenRouter reproduction returns truncated function arguments, while a JSON string argument preserves the intended object; the existing Muse recording covers the string `"null"`, not JSON `null`.

## What Changes

- Give OpenCode's `loop_reply` one required string argument, `reply`, containing the JSON-encoded worker reply, and describe the supplied worker schema in the tool instruction.
- Decode that string without repairing it. Reject malformed JSON, non-object replies and missing required top-level properties within the same model turn; pass decoded completed root replies to the loop's existing schema validation.
- Cover actual JSON `null`, nested nullable fields and malformed calls through the tool and adapter, with live MiMo and Muse verification rather than treating the old string-valued recording as proof of nullable transport.
- Update the adapter documentation for the new tool argument. Worker invocation paths, reply files and role schemas keep their existing format.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: amend Shipped adapters to transport OpenCode replies as one JSON string argument and preserve decoded values, including null, while retaining required-property rejection and final loop validation.

## Impact

`src/adapters/opencode.ts`, its tests and OpenCode recordings in `test/adapters.test.ts`, `test/helpers.ts`, `test/recordings/`, the OpenCode implementation integration test in `test/implementation.test.ts`, and `README.md`. No new dependency, configuration option, persistent setting or controller state is needed. The model-facing tool arguments change; the worker interface does not.
