# Proposal

## Why

Meta's Muse Spark ends its turn with text after it has used other tools, without calling `loop_reply`, so every `loop-opencode` worker on Muse fails with a missing reply. On 2026-10-16 the installed 0.8.3 adapter failed this way in every live run that read a file first: on OpenCode 1.18.34 and 1.19.1, under the default agent and `--agent plan`, with nullable and string-only schemas. The Muse recording that passes (`test/recordings/opencode-api-muse.json`) forbids commands and file reads, but every real worker prompt reads the repository.

In three of three live runs, one follow-up prompt in the same session, asking for the `loop_reply` call, got exactly that call, made no other tool calls, and wrote a valid `{"planProblem":null}` reply.

## What Changes

- An otherwise successful OpenCode prompt without a root `loop_reply` call gets one follow-up prompt in the same session asking for that call. A follow-up that also ends without one is a missing reply, as today.
- The `loop-opencode` README paragraph describes the follow-up.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: amend Shipped adapters so that a missing OpenCode reply-tool call gets one same-session follow-up prompt before the adapter reports a missing reply.

## Impact

`src/adapters/opencode.ts`, the OpenCode stub in `test/helpers.ts`, the OpenCode tests in `test/adapters.test.ts`, and the `loop-opencode` paragraph in `README.md`. No new dependency, option, setting or state. Other adapters do not change.
