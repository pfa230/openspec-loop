# Design

## Context

The adapter writes `loop_reply.js` into a temporary `OPENCODE_CONFIG_DIR` with `args` set to the worker schema's `properties` and an `execute()` that returns "Reply recorded." for any input (`src/adapters/opencode.ts:40-47`). OpenCode 1.18.34 advertises that tool to the model with the schema's `required` list, but it does not enforce raw JSON Schema `args`, so `{}` reaches `execute()` and completes. The adapter keeps only completed calls (`opencode.ts:185`), and a test already shows that an errored root call does not supply the reply (`test/adapters.test.ts:329`). When OpenCode's own tools throw from `execute()`, such as `read` on a missing file, the part ends with status `error`, the error text goes back to the model and the turn continues (seaperch `add-3d-preview/transcripts/003-implementation.log`).

## Goals / Non-Goals

**Goals:**
- An incomplete reply-tool call fails in the model's turn rather than after it.

**Non-Goals:**
- Full schema validation in the tool. Wrong types, extra properties and nested findings fields are still caught by the loop's reply validation after the turn. No run has failed on them.
- Retrying the worker, parsing text, or other recovery outside the model's own turn.

## Decisions

**`execute(args)` throws when a required top-level property is missing.** The generated tool embeds the schema's `required` list and throws `Error("loop_reply is missing required properties: <names>. Call loop_reply again with every required property.")` when any are absent from `args`. A thrown error is the mechanism OpenCode already uses to return tool failures to the model, and the adapter already ignores calls that end in error, so the adapter's reply handling does not change.

Alternative: validate the whole schema in the tool. That needs a JSON Schema validator, either a new dependency or a hand-written subset that duplicates the loop's per-role guards in `src/prompts.ts`, to catch failures no run has shown.

Alternative: pass OpenCode's own zod schemas as `args` so OpenCode enforces them. The generated tool would have to resolve OpenCode's plugin package from a temporary configuration directory and convert JSON Schema to zod, which adds more moving parts than a key check.

## Risks / Trade-offs

- [A model that gets the error may still end its turn without calling again] → The adapter reports a missing reply, which names the real cause more accurately than today's malformed reply. A person runs `loop resume` as before.
- [OpenCode could stop returning thrown tool errors to the model] → The transcript evidence covers built-in tools on the installed version. The adapter test checks the tool's own contract (throw on a missing property, string on a complete call), not OpenCode's handling.
