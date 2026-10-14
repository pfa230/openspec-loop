# Design

## Context

See `proposal.md` for the failure. The adapter owns one `opencode serve` child, subscribes to `/event`, submits one prompt with `format: { type: "json_schema", schema }` and writes the response's `info.structured`. The controller checks every reply against the role schema (`src/step.ts`), and worker schemas list every property as required, nullable where optional (`src/prompts.ts`).

[Verified, OpenCode 1.18.34 source] `prompt.ts:1285` forces `toolChoice: "required"` for every `json_schema` prompt. The plugin `chat.params` hook exposes only temperature, top-p, top-k, output tokens and provider options, not the tool choice (`packages/plugin/src/index.ts:247`). OpenCode loads custom tools from `{tool,tools}/*.{js,ts}` in every configuration directory (`tool/registry.ts:185`), and `OPENCODE_CONFIG_DIR` appends one directory to those it already reads (`config/paths.ts:39`). A tool whose `args` are plain JSON Schema definitions, not Zod, is offered to the model with those properties, all marked required, and its call is not validated (`tool/registry.ts:125-137`, `legacyJsonSchema`).

[Verified, prototype on 2026-10-14 with `opencode run` and a 10-line tool file] Muse 1.3, Muse 1.3-contributor (build and plan agents), Qwen 3.7-plus, MiMo 2.6-pro and DeepSeek 4.1-flash all called the tool with no HTTP 400; pure mode still loaded it. A tool taking one nested `reply` argument was flattened by Muse into top-level properties, so the tool takes the schema's properties directly. OpenCode installed `@opencode-ai/plugin` into the fresh directory on first load, adding about 4 seconds; a reused directory did not repeat it.

## Goals / Non-Goals

**Goals:** a reply path that works under OpenCode's default tool choice, keeping the owned server, event handling, permissions, usage accounting and failure reporting as they are.

**Non-Goals:** recovering when a model skips the tool or calls it with wrong values; a persistent tool directory; per-model behavior.

## Decisions

### Supply the tool through a per-worker configuration directory

Before starting the child, create a temporary directory with `mkdtemp` and write `tool/loop_reply.js`: a default export with a fixed description, `args` set to the worker schema's `properties` (JSON is a valid JavaScript literal), and an `execute` that returns a fixed acknowledgement. Start the child with `OPENCODE_CONFIG_DIR` set to that directory and remove the directory after the child has exited. The file imports nothing, so it does not depend on OpenCode's background dependency install.

Alternatives: a plugin through `OPENCODE_CONFIG_CONTENT` would replace a user's inline configuration; a tool under the worktree's `.opencode/` would enter the change's diff; a directory kept per run needs a location the four-path worker interface does not give and its own cleanup, to save about 4 seconds per worker step; the native format cannot drop its forced choice; a gateway that rewrites `tool_choice` is a service for the user to run.

### Read the reply from the event stream

The adapter already parses root-session `message.part.updated` events for usage. Keep the `state.input` of each root-session part with `type: "tool"`, `tool: "loop_reply"` and `state.status: "completed"`; the last one is the reply. Delegated sessions see the tool too, but their calls are ignored by the same session filter. The prompt response's `info.error` still fails the worker; `info.structured` is no longer read. Writing the reply from inside the tool would need the reply path and root session in the tool's environment, which the event stream already provides to the adapter.

### Refuse an inherited `OPENCODE_CONFIG_DIR`

OpenCode reads one such directory, so setting it would silently drop the user's. Fail by name before starting the child, as unsupported arguments do.

### Prompt instruction

Replace the `StructuredOutput` instruction with one that asks the model to finish, after the work and any required presentation, by calling `loop_reply` with the reply's fields, and states that text cannot serve as the reply.

### Tests

The stub server answers the prompt without `info.structured` and emits a completed root `loop_reply` part from its scripted stream; it records the configuration directory it received and the tool file inside it. Replace `opencode-api-native.json` with a redacted recording from a live run of the compiled adapter against Muse, the issue's model.

## Risks / Trade-offs

- [A model ends the turn without calling the tool] → the worker fails as a missing reply; the forced choice no longer prevents this. Accepted: OpenCode's forced route fails those providers on every prompt.
- [A model keeps working after the call and the session errors, as Qwen 3.7-plus in plan mode did once] → execution failure; the recorded reply is not used. Accepted under the existing session-error rule.
- [Schema-valid but wrong values, such as Muse's `"null"` string] → not detectable by the adapter or the loop; unchanged from native output, where GLM did the same.
- [OpenCode changes custom-tool loading or `OPENCODE_CONFIG_DIR`] → the README already pins the adapter to OpenCode 1.18.34.
