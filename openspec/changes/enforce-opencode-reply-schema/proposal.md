# Proposal

## Why

Source issue: https://github.com/pfa230/openspec-loop/issues/54

A MiMo implementation turn returned prose followed by its JSON reply, so `loop-opencode` stopped after the implementation edits instead of completing the worker turn. OpenCode 1.18.34 has native structured output, but the adapter currently relies on a prompt asking for bare JSON and parses the final text message.

## What Changes

- Enable OpenCode's native `json_schema` message format using the worker's supplied schema for every OpenCode turn.
- Write the native `StructuredOutput` result as the worker reply; prose remains in the transcript and is never parsed for a reply.
- Retain the existing CLI invocation, argument passthrough, execution restrictions, transcripts, usage accounting and controller validation.
- Load a bundled OpenCode message hook only for the worker process, through an inline configuration overlay that preserves existing configuration. No user installation or persistent configuration edit is required.
- Report unavailable or failed native structured output as an execution failure, without falling back to text or launching another worker turn. Commands that disable or bypass the local hook cannot provide a successful reply.
- Cover the issue's cut-report-before-JSON failure and verify that a native reply reaches the existing commit/check/review sequence while a failed turn preserves its edits.
- Update the OpenCode adapter documentation and regression coverage for native output.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: require the OpenCode adapter to enable and consume native schema output, replacing its current final-text behavior.

## Impact

Implementation is bounded to `src/adapters/opencode.ts`, one bundled schema hook under `src/adapters/`, the child-environment parameter of `src/adapters/common.ts`, adapter tests/recordings, and the OpenCode guidance in `README.md`. One JSONC parsing dependency preserves inherited inline configuration. The four-path worker interface and loop state remain unchanged.

The change does not fix MiMo's unsupported plan-mode claim, revise its implementation, mark its checklist or resume the stopped labeler run. It prevents prose wrapping from becoming the worker-reply protocol.
