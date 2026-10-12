# Proposal

## Why

Source issue: https://github.com/pfa230/openspec-loop/issues/54

A MiMo implementation turn returned prose followed by its JSON reply, so `loop-opencode` stopped after the implementation edits instead of completing the worker turn. OpenCode 1.18.34 has native structured output, but the shipped adapter requests bare JSON and parses final text; a live test also showed that the proposed message hook cannot install the native runtime format.

## What Changes

- Start one worker-owned local OpenCode server in the worktree and submit the supplied schema through its supported prompt API, which decodes the native format before saving the user message.
- Write the successful prompt response's native structured object as the reply; streamed prose remains in the transcript and is never parsed for a reply.
- Preserve inherited configuration, execution restrictions, per-step usage accounting and controller validation without installing a plugin or editing configuration.
- **BREAKING:** Replace arbitrary OpenCode run-argument passthrough with explicit support for model (`-m`/`--model`), agent, variant, `--auto` and `--pure`; reject other arguments by name before starting the harness, including attached-server and session-continuation modes. Other shipped adapters retain passthrough. Pure mode no longer conflicts with native output because enablement uses the API.
- Preserve OpenCode's headless permission behavior: deny questions and plan-mode transitions, reject permission requests by default, and approve requested permissions only when explicitly enabled by `--auto`, leaving configured denies intact.
- Report missing native output, API/session failures and unexpected server exits explicitly, preserving reported usage before failing; terminate the owned server on completion, failure or interruption. Never parse text or launch another worker turn.
- Cover the issue's cut-report-before-JSON failure and verify that a native reply reaches the existing commit/check/review sequence while a failed turn preserves its edits.
- Update the OpenCode adapter documentation and regression coverage for native output.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: require the OpenCode adapter to enable and consume native schema output, replacing its current final-text behavior.

## Impact

Implementation touches `src/adapters/opencode.ts`, `test/adapters.test.ts`, `test/implementation.test.ts`, fixtures in `test/helpers.ts` and `test/recordings/`, and OpenCode guidance in `README.md`. The unfinished hook implementation and its JSONC dependency are removed during apply, including the dependency entries in `package.json` and `package-lock.json`. Built-in Node HTTP/stream facilities need no new runtime dependency. Reuse common counter, usage and reply helpers without changing `src/adapters/common.ts`; the four-path worker interface and loop state remain unchanged.

The change does not fix MiMo's unsupported plan-mode claim, revise its implementation, mark its checklist or resume the stopped labeler run. It prevents prose wrapping from becoming the worker-reply protocol.
