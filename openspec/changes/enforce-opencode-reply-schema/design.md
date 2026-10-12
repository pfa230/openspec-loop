# Design

## Context

See `proposal.md` and issue #54 for the failure. `src/adapters/opencode.ts` invokes `opencode run --format json`, sums `step_finish` usage and parses the last `text` event. `runHarness()` already forwards the complete stdout to the transcript and preserves reported usage before judging the child's exit. `readReply()` already validates the role's reply shape. These components are reused.

[Verified source behavior] OpenCode 1.18.34's CLI has no schema argument, but its prompt engine enables `StructuredOutput` when the user message's `format` is `json_schema`. The CLI emits a successful call as a completed `tool_use` part containing the object input, and filters out parts from other sessions. Its `chat.message` hook can mutate the message before it is saved. Plugin configuration accepts `[specifier, options]` tuples. A turn that ends without native output can save a `StructuredOutputError` internally without emitting a session error; a genuine session error does cause the local CLI to exit nonzero.

Sources: [prompt engine](https://github.com/anomalyco/opencode/blob/v1.18.34/packages/opencode/src/session/prompt.ts), [CLI event stream](https://github.com/anomalyco/opencode/blob/v1.18.34/packages/opencode/src/cli/cmd/run.ts), [plugin loader](https://github.com/anomalyco/opencode/blob/v1.18.34/packages/opencode/src/plugin/index.ts), [plugin configuration type](https://github.com/anomalyco/opencode/blob/v1.18.34/packages/core/src/v1/config/plugin.ts), [configuration](https://github.com/anomalyco/opencode/blob/v1.18.34/packages/opencode/src/config/config.ts), [runtime flags](https://github.com/anomalyco/opencode/blob/v1.18.34/packages/opencode/src/effect/runtime-flags.ts).

## Goals / Non-Goals

The worker reply comes from native schema output, with the repository's cut report retained as transcript text. Enablement requires no action from the user after upgrading the package.

This change does not diagnose or repair the labeler implementation, remove its presentation requirements, add retries, or change controller progression. A native output failure remains a failure; this design does not promise that a model can never fail to call the required tool.

## Decisions

### Keep one CLI invocation and enable its native format through a bundled hook

Add `src/adapters/opencode-schema.ts`, shipped as compiled JavaScript by the existing `dist/src` package inclusion. Export only its plugin factory as the default export, with no adapter entrypoint import or startup side effects. The factory receives the schema in plugin options. Its `chat.message` hook sets the root worker message's `format` to `{ type: "json_schema", schema }`. Remember the first session id in that process and apply the schema only to that session, so delegated sessions keep their own instructions and formats.

The adapter appends this fixed file plugin, with an absolute file URL and schema options, to a worker-scoped `OPENCODE_CONFIG_CONTENT` overlay. Preserve all inherited inline settings and existing plugin entries. Use `jsonc-parser` to parse inherited content with the same comments/trailing-comma support as OpenCode; fail with a configuration error when parsing fails rather than replace it with defaults. OpenCode continues loading the user's existing file configuration normally. Do not edit any `opencode.json` or `.opencode/` file.

Assign the overlay to `process.env.OPENCODE_CONFIG_CONTENT` inside `opencode.ts` before its existing `runHarness()` call. Each adapter is already a separate process started by `startWorker()` and spawns one harness, so this environment change is scoped to that worker. It cannot modify the loop's or another worker's environment. Leave `src/adapters/common.ts` unchanged.

Alternatives: repeating the prompt cannot enforce the output; extracting JSON violates #54's strict boundary. A separate SDK/server runner would need new server lifecycle, permission handling and CLI argument translation despite the existing CLI already providing the events needed here. The fixed hook avoids those mechanisms and adds no loop plugin configuration surface.

### Consume a completed native result and remove text parsing

Accept the last `tool_use` event for `StructuredOutput` with `state.status: "completed"`, and write its object input through the existing `writeReply()`. The CLI already filters parts to the active session, and completed native execution already implies the success marker; add neither a session filter nor a metadata-marker check in the adapter. The controller still runs `readReply()` with the existing role validator; do not implement another schema validator.

Prose and text-only JSON cannot supply a reply. Reuse `runHarness()` to preserve a nonzero child's exit status and reported usage before reply selection; the local CLI already converts emitted session errors into a nonzero exit. If the child exits zero but no native completion succeeds, report missing native output. Do not add native-error or session-error parsing branches: the internal no-output error is not exposed by this CLI, and failed tool attempts can precede a later successful completion within the same harness turn. The adapter launches no retry.

Keep the worker prompt's semantic instructions, and replace the adapter's bare-JSON appendix with a short instruction to finish through OpenCode's native structured-output tool after completing the work and any required presentation. No separate presentation event or file is needed.

### Preserve arguments, but reject modes that cannot load the local hook

Forward the existing compatible CLI arguments unchanged, including model, agent, variant and permission options. Refuse enabled pure mode (`--pure`, its enabled equals form, or `OPENCODE_PURE` enabled under OpenCode's boolean semantics) and every `--attach`/`--attach=` before starting a model turn, including localhost: pure mode disables the hook and attaching handles the prompt in another process that cannot receive this local overlay. Name the incompatible setting. Do not strip it, alter permissions or silently use a text protocol. These are explicit compatibility limits of this proposal.

No OpenCode version probe, extra model call or retry is added. The minimum working behavior is tested against the installed OpenCode 1.18.34; native output being unavailable is reported by the existing failure path.

### Verify the boundary through existing tests and one real native invocation

Extend the adapter harness stub to exercise the worker overlay and load the compiled hook, then emit native tool events alongside text. Clear inherited `OPENCODE_CONFIG_CONTENT` and `OPENCODE_PURE` in the test helper by default; configuration tests set them deliberately. Keep tests at the worker boundary: supplied schema reaches the hook, inherited configuration survives, compatible arguments pass through, and only native output becomes the reply. Include #54's cut-report-plus-JSON text and the real native-no-output shape as failures: optional text, no completed native tool, child exit zero. Include a session-error event with child exit one to prove the existing child-exit path wins, and a successful variant with a separate native result. Assert one child invocation and preserved usage on errors.

Use an implementation-cycle test to show that a native-reply success continues through commit/check/review and that an adapter failure preserves edits without committing or advancing that attempt. Reuse the existing repository fixtures and validators.

During apply, capture one real OpenCode 1.18.34 run in a disposable directory using the configured MiMo model, asking for a cut report and a small schema reply. Inspect the structured tool completion, reply object and usage. Keep a small redacted recording under `test/recordings/`, not the whole private implementation transcript. This checks that the compiled hook loads in the actual harness; stub tests alone cannot establish that.

## Risks / Trade-offs

- The CLI has no schema flag, so the hook depends on the documented message-hook shape and versioned native tool events. Verify both in the real smoke run and keep the adapter failure explicit if a later version changes them.
- Native auto-compaction can create follow-up messages without inheriting the original format in OpenCode 1.18.34. A turn that then produces no native result still fails explicitly; this proposal adds no compaction workaround or text fallback. That limitation is separate from accepting wrapped prose as a reply.
- Existing plugins can interfere with message format or tool output. Preserve them and use completed native execution plus the controller's reply validator; a missing native result does not imply success.
- `--pure` and `--attach` cannot be retained as successful modes with this approach. Document the named refusals; ordinary `-m`/`--model`, `--agent`, and restriction wrappers continue working.

## Migration Plan

Upgrade the package after implementation and archive. Existing normal OpenCode agent commands need no edits or plugin installation. Update README's unsupported-schema claim and the compatibility limits. Keep existing stopped runs intact; resume them only when their user chooses. Rollback restores the previous package and its strict final-text protocol.

## Cut Pass

Every item below serves amended **Shipped adapters**, existing **Worker interface**, or the explicit #54 proposal request.

| Item kept | Clause/request served | Simpler version and concrete failure |
|---|---|---|
| Native `json_schema` format | Shipped adapters: enable native enforcement | Prompt-only JSON repeats #54. |
| Fixed bundled message hook | Shipped adapters: enforce while preserving CLI arguments | CLI-only cannot set the format; server rewrite adds lifecycle and argument translation. |
| Worker-scoped inline overlay | Shipped adapters: no persistent edits, preserve settings | Replacing configuration discards user restrictions/plugins. |
| JSONC parser dependency | Shipped adapters: preserve inherited inline settings | `JSON.parse` rejects comments and trailing commas accepted by OpenCode. |
| Schema plugin option | Worker interface: supplied schema | Hardcoding one role's schema breaks the other roles. |
| Root session id in hook closure | Shipped adapters: delegated sessions keep their formats | Applying to every session forces the root protocol on delegated work. |
| Adapter-local environment assignment | Shipped adapters: process-scoped enablement | Use this simpler version: the adapter process already isolates its environment. |
| Completed native tool input | Shipped adapters: native result only | Parsing `text` recreates the contamination boundary. |
| Native completed-status check | Shipped adapters: successful native result | Accepting attempted tool input returns work that never completed. |
| Missing-result check | Shipped adapters: native result only | A zero child exit alone falsely claims a usable worker reply. |
| Inline-configuration parse-error check | Shipped adapters: preserve inherited settings | Replacing malformed input with defaults silently discards settings. |
| Pure-mode refusal for argv/environment | Shipped adapters: incompatible settings fail explicitly | Checking argv alone misses `OPENCODE_PURE`, which also disables the hook. |
| Every `--attach` refusal | Shipped adapters: incompatible settings fail explicitly | Localhost also handles the prompt in a separate process without the overlay. |
| Existing usage collector | Shipped adapters: native accounting | Removing it loses costs; a second lookup duplicates the pipeline. |
| Existing reply validator | Worker interface: role shape | Trusting an object alone accepts the wrong role reply; a new validator duplicates it. |
| Adapter regression fixture/checks | #54 acceptance and Shipped adapters | A happy-path JSON fixture misses the reported boundary failure. |
| Controlled test configuration environment | #54 regression evidence | Inheriting the developer's overlay/pure settings changes test outcomes. |
| Implementation-cycle check | #54 acceptance | Adapter-only tests cannot establish commit/check/review progression or preserved edits. |
| Real native smoke recording | Shipped adapters: actual enablement | Stubs cannot reveal a hook that the installed OpenCode refuses to load. |
| README update | #54 fix usability | Leaving it unchanged says native enforcement is impossible. |
| Proposal record | Explicit proposing request | Tasks alone omit scope and motivation. |
| Delta spec record | Repository contract rule | Code-only work leaves the prose-failure contract unchanged. |
| Design record | Explicit proposing request; required decisions | Omitting it leaves the hook and compatibility choices undecided. |
| Task checklist record | Explicit proposing request | Prose alone is not a native apply checklist. |
| `.openspec.yaml` record | Explicit native proposing request | Omitting native metadata loses the selected schema and change identity. |
| Task 1.1: hook/overlay/adapter environment | Shipped adapters: enable native output without losing settings | Consumption alone still leaves the harness in text mode. |
| Task 1.2: native reply, refusals and docs | Shipped adapters and #54 acceptance | Hook-only work leaves the final-text parser rejecting successful native turns. |
| Task 1.3: real harness smoke/recording | Shipped adapters: actual enablement | A stub can accept a plugin that the installed harness cannot load. |
| Task 2.1: implementation-cycle regression | #54 acceptance | Adapter tests do not cover commit/check/review progression or preservation of edits. |
| Task 2.2: integrated checks and cut pass | Repository-required check and explicit proposing workflow | An isolated adapter test misses integration regressions. |

Removed after review:

- Optional `runHarness()` environment parameter: the adapter process already scopes its own environment.
- Native-error parsing branch: the CLI does not expose its internal no-output error; missing completion is sufficient.
- Adapter session-error branch: the CLI exit status and existing `runHarness()` failure path already handle it.
- Root-session filter on tool events: the CLI already filters them.
- Native `valid: true` metadata check: completed `StructuredOutput` execution already supplies it.
- Text fallback clause: every shipped adapter now uses native enforcement.
- Separate OpenCode session-error scenario: the existing harness-exit failure scenario already covers it; keep the realistic fixture in the adapter tests.

Previously cut: prose extraction, a separate server runner, repair retries/retry overrides, another controller validator, presentation sidecars, persistent plugin installation, version probes and compaction workarounds. These conflict with #54's boundary or add mechanisms unnecessary to the chosen route.
