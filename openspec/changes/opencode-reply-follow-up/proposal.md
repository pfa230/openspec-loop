# Proposal

## Why

Meta's Muse Spark ends its turn with text after it has used other tools, without calling `loop_reply`, so every `loop-opencode` worker on Muse fails with a missing reply. On 2026-10-16 the installed 0.8.3 adapter failed this way in every live run that read a file first: on OpenCode 1.18.34 and 1.19.1, under the default agent and `--agent plan`, with nullable and string-only schemas. Its reasoning names the `loop_reply` call it never makes. The Muse recording that passes (`test/recordings/opencode-api-muse.json`) forbids commands and file reads, but every real worker prompt reads the repository.

In three of three live runs, one follow-up prompt in the same session, asking only for the `loop_reply` call, got exactly one `loop_reply` call, made no other tool calls, and wrote a valid `{"planProblem":null}` reply.

## What Changes

- When an OpenCode prompt completes without an API or session error and without a completed root `loop_reply` call, the adapter sends one follow-up prompt in the same session, with the worker's model, agent and variant selections, asking the model to call `loop_reply` without repeating the work.
- A follow-up that also ends without a completed root `loop_reply` call is reported as a missing reply, as today. Prompts that fail get no follow-up.
- Usage covers the model steps of both prompts.
- The contract's ban on repairing text or launching another worker turn stays; it gains this single follow-up prompt as its one stated exception.
- The `loop-opencode` README paragraph describes the follow-up.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: amend Shipped adapters so that a completed OpenCode prompt without a root reply-tool call gets one same-session follow-up prompt before the adapter reports a missing reply.

## Impact

`src/adapters/opencode.ts`, the OpenCode stub in `test/helpers.ts`, the OpenCode tests in `test/adapters.test.ts`, a new redacted Muse recording under `test/recordings/`, and the `loop-opencode` paragraph in `README.md`. No new dependency, configuration option, persistent setting or controller state. Other adapters do not change.
