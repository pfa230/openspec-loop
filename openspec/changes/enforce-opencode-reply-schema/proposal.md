# Proposal

## Why

Source issue: https://github.com/pfa230/openspec-loop/issues/54

A MiMo implementation turn returned prose followed by its JSON reply, so `loop-opencode` stopped after the implementation edits instead of completing the worker turn. OpenCode 1.18.34 has native structured output, but the adapter currently relies on a prompt asking for bare JSON and parses the final text message.

## What Changes

- Enable OpenCode's native `json_schema` message format using the worker's supplied schema for every OpenCode turn.
- Write the native `StructuredOutput` result as the worker reply; prose remains in the transcript and is never parsed for a reply.
- Retain the existing CLI invocation, argument passthrough, execution restrictions, transcripts, usage accounting and controller validation.
- Load a bundled OpenCode message hook only for the worker process, through an inline configuration overlay that preserves existing configuration. No user installation or persistent configuration edit is required.
- Report an absent successful native result as missing native output, and preserve a failed child's exit status, without falling back to text or launching another worker turn. Refuse enabled pure mode and every `--attach`, including localhost, because they disable or bypass the local hook.
- Cover the issue's cut-report-before-JSON failure and verify that a native reply reaches the existing commit/check/review sequence while a failed turn preserves its edits.
- Update the OpenCode adapter documentation and regression coverage for native output.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: require the OpenCode adapter to enable and consume native schema output, replacing its current final-text behavior.

## Impact

Implementation touches `src/adapters/opencode.ts`, one bundled schema hook under `src/adapters/`, `test/adapters.test.ts`, `test/implementation.test.ts`, the supporting fixtures in `test/helpers.ts` and `test/recordings/`, and the OpenCode guidance in `README.md`. The JSONC parsing dependency also changes `package.json` and `package-lock.json`. Set the overlay in the adapter process's own environment and reuse `src/adapters/common.ts` unchanged. The four-path worker interface and loop state remain unchanged.

The change does not fix MiMo's unsupported plan-mode claim, revise its implementation, mark its checklist or resume the stopped labeler run. It prevents prose wrapping from becoming the worker-reply protocol.
