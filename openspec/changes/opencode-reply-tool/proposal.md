# Proposal

## Why

Source issue: https://github.com/pfa230/openspec-loop/issues/66

`loop-opencode` requests OpenCode's native structured output, and OpenCode 1.18.34 implements it as a `StructuredOutput` tool forced with `tool_choice: "required"` (`packages/opencode/src/session/prompt.ts:1285`). Providers that accept only `"auto"` reject every worker prompt with HTTP 400 before any work: Meta's Muse Spark always, and Qwen 3.7-plus in thinking mode, measured through the current adapter on 2026-10-13. The upstream reports (anomalyco/opencode#45953, #46735) are open. The prompt API and plugin hooks expose no way to change the forced choice. The native route also adds no enforcement: OpenCode accepted MiMo's `{}` against a schema that requires a property, so the loop's own reply validation is the only check that holds.

## What Changes

- Replace the native `format` request with an adapter-supplied reply tool. For each worker prompt the adapter creates a temporary OpenCode configuration directory holding one custom tool, `loop_reply`, whose arguments are the worker schema's properties. The adapter passes the directory through `OPENCODE_CONFIG_DIR`, which OpenCode adds to the configuration it already loads, and removes it when the worker ends. OpenCode leaves `tool_choice` at its default, so models that accept only `"auto"` can reply.
- The reply is the arguments of the root session's last completed `loop_reply` call, read from the event stream the adapter already subscribes to. A turn that ends without one fails as a missing reply. Text is never parsed for a reply. The loop's existing schema check remains the only reply validation.
- **BREAKING:** an inherited `OPENCODE_CONFIG_DIR` cannot be honored alongside the adapter's directory, so the adapter names it and fails before starting the harness.
- Remove the native-output prompt instruction, `info.structured` selection and the README's native-format caveats; document the reply tool and the provider limitation it removes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: the Shipped adapters requirement replaces OpenCode's native structured output and "harness's own schema enforcement" with the adapter's reply tool and the loop's reply validation.

## Impact

Implementation touches `src/adapters/opencode.ts`, `test/adapters.test.ts`, the OpenCode stub in `test/helpers.ts`, OpenCode recordings in `test/recordings/`, the implementation-cycle tests that use the stub, and the OpenCode section of `README.md`. No dependency is added; the generated tool file has no imports. The worker interface, controller and other adapters are unchanged.

Non-goals: no retry, repair prompt or second worker turn when a model skips the tool or replies with wrong content; no per-model capability list; no change for models that cannot call tools at all; no upstream OpenCode fix.
