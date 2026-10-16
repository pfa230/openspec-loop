# Design

## Context

See `proposal.md` for the failure. This plan is based on cached `origin/main` at `5e776a0` (0.8.2), including the existing missing-property guard, rather than the older main checkout. `src/adapters/opencode.ts` supplies raw worker-schema properties as custom-tool arguments; `execute(args)` checks required keys, and the adapter takes `state.input` from the last completed root call. The loop already checks the final reply with the role guards in `src/prompts.ts`. Both implementer `planProblem` and review finding `question` legitimately use JSON null.

Planning probes on 2026-10-16 established:

- [Verified] In labeler's `homebox-link-routes/transcripts/002-implementation.log`, text contains `<parameter=planProblem>null</parameter>` while executed `loop_reply` calls have empty input. That transcript does not contain the raw provider response, so it cannot establish that valid structured arguments were stripped locally.
- [Verified] OpenCode 1.19.1 against an isolated local OpenAI-compatible fake provider advertises the existing nullable schema correctly and executes `{"planProblem":null}` without losing the value.
- [Verified] A separate direct OpenRouter request to `xiaomi/mimo-v2.6-flash`, served by Xiaomi, returns text containing the null parameter but function `arguments` equal to the truncated string `{"planProblem": `. This establishes an upstream argument-serialization failure in a reproduction, not the exact raw response of the original run.
- [Verified] The installed adapter reproduces empty arguments with MiMo. Replacing the nullable type array with equivalent `anyOf` yields the string `"null"`, which the controller would treat as a plan problem. A disposable probe with one string argument instead returns `{"reply":"{\"planProblem\":null}"}`; JSON decoding preserves actual null. These probes use the existing adapter with disposable schemas, not a changed project implementation.
- [Verified] The existing Muse recording and assertion in `test/adapters.test.ts` use `{"planProblem":"null"}`. The HTTP/SSE stub scripts tool events; it does not exercise provider argument serialization.

## Goals / Non-Goals

**Goals:** Preserve the role reply as JSON through a tool argument shape demonstrated to work on the failing provider path. Keep the model's supplied values and the worker reply-file interface intact.

**Non-Goals:** Repairing provider XML or text, defaulting missing fields to null, converting the string `"null"` to null, retrying workers, disabling the repeat-call guard, changing permission approval, patching OpenCode/OpenRouter, or supporting both old and new tool argument forms. No new dependency, option, persistent setting or run state.

## Decisions

### One string argument carries every role's reply

The generated tool takes only `reply`, a required JSON Schema string. Its argument description includes the complete supplied worker schema and says to JSON-encode an object matching it. The appended prompt says to call `loop_reply` with that string and gives the encoding convention. In particular, `{"reply":"{\"planProblem\":null}"}` carries an implementer success, `{"reply":"{\"findings\":[]}"}` carries review approval, and `{"reply":"{}"}` carries acknowledgement. Keep raw JSON Schema custom-tool registration; a single string needs no JSON-Schema-to-Zod converter or plugin import.

Alternative: keep direct properties and express nullable fields with `anyOf`. The live probe still returns the wrong value. Alternative: native Zod schemas. Those add conversion and dependency-resolution work without evidence that they fix this upstream failure. Alternative: separate completion tools per role or sentinel values. Those add protocols or change reply semantics; one string preserves all current shapes, including nested nulls.

### Validate transport in the tool, validate role values in the loop

`execute(args)` requires a string `reply`, parses it with `JSON.parse`, and requires a non-null, non-array object. It then applies the existing required-top-level-property check to the decoded object, accepting present null values. Missing `reply`, a non-string, malformed JSON, a non-object or a missing required key throws an error identifying the problem, so the model can correct its call in the same turn. Return the existing acknowledgement only after those checks. Do not add full schema validation: wrong property values, nested omissions and extra object properties still go to the loop's existing guards.

For the root session's last completed `loop_reply` event, parse `state.input.reply` as JSON and retain the decoded object as the reply. Parsing once in each process is necessary: the tool rejects bad calls within the model turn, while the adapter obtains its reply through event input. Keep the existing root-session filter and completed-call rule, so failed and delegated calls cannot replace a reply. Text never supplies a reply, and decoding never repairs or coerces values. A completed event with an invalid envelope is an execution failure.

### Exercise the actual boundaries

Update the shared fixture's tool events and the existing adapter and implementation integration tests to use the string argument. Test real JSON null, a non-null plan problem, nested finding `question: null`, acknowledgement, malformed envelopes, missing decoded keys, last completed root selection and final role validation. Preserve the old recording's historical meaning until replacing it with a fresh recording of the new protocol; never relabel a string-null success as actual-null success.

During apply, verify the compiled adapter with installed OpenCode 1.19.1 and both MiMo via OpenRouter and the existing Muse automatic-tool-choice path, in disposable directories. Capture redacted recordings of those invocations for replay. Each must produce actual null in the decoded implementer reply without an empty-argument rejection, forced tool choice, or text parsing, and retain cut-report text and cleanup. Also exercise a nested-null review reply with MiMo. This is manual implementation verification, not an inference call added to `npm test` or to runtime usage collection.

## Risks / Trade-offs

- [Providers see a string parameter rather than the reply's nested structure] → Include the supplied schema in its description and verify implementer and review replies through the live failing path; the loop still validates the decoded object.
- [The model sends an object or double-encoded string instead] → Reject the malformed transport in its turn without accepting a second format or guessing the intent.
- [A provider changes its serializer or returns another malformed call] → Preserve execution failure and existing permission behavior. The observed successful probe supports the choice but does not guarantee every future provider response.
- [MiMo success hides a regression for Muse] → Require a fresh live Muse recording through the compiled adapter, preserving automatic tool choice.

## Migration Plan

This changes a generated per-worker tool, not saved run state or role schemas. New worker invocations use the string argument; an already running worker keeps its own generated tool. Resume remains an explicit user action outside this proposal. Rolling back the adapter restores the previous generated tool without migrating reply files.

## Cut pass

- Kept one string parameter for Shipped adapters' encoded-reply clause; simpler direct nullable properties reproduce malformed upstream arguments.
- Kept the schema description and encoding instruction for Shipped adapters' model-instruction clause; a bare string parameter leaves the model without the supplied schema.
- Kept JSON decoding in the tool and adapter for Shipped adapters' within-turn rejection and decoded-file clauses; parsing only in the adapter delays feedback, while parsing only in the tool leaves the adapter with an encoded event input.
- Kept the decoded-object check for Shipped adapters' malformed-transport clause; parsing alone accepts JSON null, arrays and primitives, including for acknowledgement schemas with no required keys.
- Kept the existing required-key check for Shipped adapters' missing-property clause; removing it again acknowledges incomplete replies before final loop validation.
- Reused final role validation for Shipped adapters' schema-check clause; no new full validator, schema converter or dependency is needed.
- Reused root filtering for Shipped adapters' root-session clause; dropping it accepts a delegated reply.
- Reused last-completed selection for Shipped adapters' reply-selection clause; taking the first call ignores a later correction.
- Reused permission handling for Shipped adapters' headless-restrictions clause; automatic approval would weaken the configured restrictions.
- Reused cleanup for Shipped adapters' owned-process clause; leaving the process alive leaks a server after the worker ends.
- Reused usage collection for Shipped adapters' accounting clauses; omitting it loses already reported usage on failure.
- Kept task 1.1 and generated-tool tests for the encoded-reply and malformed-transport clauses; a direct `execute({planProblem:null})` test bypasses the changed transport.
- Kept task 1.2 and existing adapter/integration tests for decoded-value preservation and reply selection; scripted success alone would miss incorrect decoding or downstream interpretation.
- Kept task 1.3's README update for the requested protocol change; leaving the direct-properties description would misdocument the new invocation.
- Kept task 2.1 for Shipped adapters' nullable-transport and automatic-tool-choice clauses; scripted replay alone cannot test the provider path.
- Kept a redacted MiMo recording for nullable transport; the stub cannot expose the provider failure. Reuse the existing replay infrastructure.
- Kept a fresh Muse recording for automatic tool choice; MiMo alone does not establish Muse compatibility. Reuse the existing replay infrastructure.
- Kept task 2.2 for the repository's explicit `npm test` rule and strict native OpenSpec validation; compilation alone omits runtime checks and artifact validation.
- Removed nullable-schema rewriting because its live result was still the string `"null"`.
- Removed native-Zod conversion because the single string argument needs no schema converter or new dependency.
- Removed separate completion tools because one tool carries every existing role reply.
- Removed sentinels because the JSON string preserves the existing null semantics.
- Removed fallback argument formats because the chosen transport needs only one encoding.
- Removed text repair because the contract requires the reply to come from a completed tool call.
- Removed additional retries because the contract stops on worker execution failure.
- Removed permission changes because the contract preserves configured restrictions.
- Added no configuration option, state field or runtime record because the existing invocation and event stream already carry the reply.
