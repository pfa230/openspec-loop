# Tasks

## 1. Carry the worker reply in one JSON string

- [ ] 1.1 Change the generated `loop_reply` in `src/adapters/opencode.ts` to take one required string `reply`, describe the complete worker schema and encoding, and reject missing/non-string input, invalid JSON, non-object decoded values and missing decoded required keys before acknowledgement. Update the appended prompt and the generated-tool tests in `test/adapters.test.ts`; verify that actual null and a non-null plan problem succeed, malformed transports reject, and present but schema-invalid values remain for loop validation.
- [ ] 1.2 Decode only the last completed root call's `state.input.reply` into the existing reply file. Update the shared fixture, existing OpenCode recordings/replay assertions and implementation integration tests for this transport. Verify actual `planProblem: null`, nested finding `question: null`, `{}` acknowledgement, root/delegated/failed-call selection, text-only missing replies and rejection of a schema-invalid decoded value; never synthesize success from malformed transport or coerce the string `"null"`.
- [ ] 1.3 Update the `loop-opencode` paragraph in `README.md` to describe the string argument, decoding and within-turn transport errors; check it against the Shipped adapters delta and the generated tool's instruction.

## 2. Verify the complete provider and adapter path

- [ ] 2.1 Run the compiled adapter with OpenCode 1.19.1 in disposable directories against `openrouter/xiaomi/mimo-v2.6-flash` and the existing `meta/muse-spark-1.3-contributor` path. Capture redacted new-protocol recordings for replay in the existing adapter tests, replacing the old Muse string-null recording with factual new evidence. Verify exit 0 and actual JSON null in the implementer reply, a nested-null MiMo review reply, retained cut-report text, automatic tool choice, and no owned process or temporary configuration left; check the recordings' assertions against the live outputs.
- [ ] 2.2 Run `openspec validate preserve-opencode-null-replies --strict --no-interactive` and `npm test`; verify the whole package builds and all tests pass with no network inference added to the suite.
