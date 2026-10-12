# Design

## Context

See `proposal.md` and issue #54 for the failure. `src/adapters/opencode.ts` invokes `opencode run --format json`, sums `step_finish` usage and parses the last `text` event. `runHarness()` already forwards the complete stdout to the transcript and preserves reported usage before judging the child's exit. `readReply()` already validates the role's reply shape. These components are reused.

[Verified source behavior] OpenCode 1.18.34's CLI has no schema argument, but its prompt engine enables `StructuredOutput` when the user message's `format` is `json_schema`. A successful native call carries the object in the completed tool's input and a `valid: true` metadata marker. The CLI emits completed tool parts as `tool_use` events, including this tool. Its `chat.message` hook runs before the user message is saved, and accepts mutation of that message. Inline configuration can load a local plugin with options.

Sources: [prompt engine](https://github.com/anomalyco/opencode/blob/v1.18.34/packages/opencode/src/session/prompt.ts), [CLI event stream](https://github.com/anomalyco/opencode/blob/v1.18.34/packages/opencode/src/cli/cmd/run.ts), [plugin loader](https://github.com/anomalyco/opencode/blob/v1.18.34/packages/opencode/src/plugin/index.ts), [configuration](https://github.com/anomalyco/opencode/blob/v1.18.34/packages/opencode/src/config/config.ts).

## Goals / Non-Goals

The worker reply comes from native schema output, with the repository's cut report retained as transcript text. Enablement requires no action from the user after upgrading the package.

This change does not diagnose or repair the labeler implementation, remove its presentation requirements, add retries, or change controller progression. A native output failure remains a failure; this design does not promise that a model can never fail to call the required tool.

## Decisions

### Keep one CLI invocation and enable its native format through a bundled hook

Add `src/adapters/opencode-schema.ts`, shipped as compiled JavaScript by the existing `dist/src` package inclusion. Its factory receives the schema in plugin options. Its `chat.message` hook sets the root worker message's `format` to `{ type: "json_schema", schema }`. Remember the first session id in that process and apply the schema only to that session, so delegated sessions keep their own instructions and formats.

The adapter appends this fixed file plugin, with an absolute file URL and schema options, to a child-only `OPENCODE_CONFIG_CONTENT` overlay. Preserve all inherited inline settings and existing plugin entries. Use `jsonc-parser` to parse inherited content with the same comments/trailing-comma support as OpenCode; fail with a configuration error when parsing fails rather than replace it with defaults. OpenCode continues loading the user's existing file configuration normally. Do not edit any `opencode.json`, `.opencode/` file or parent environment.

Extend `runHarness()` with an optional child environment parameter, keeping its default unchanged for other adapters. This is the only common helper change.

Alternatives: repeating the prompt cannot enforce the output; extracting JSON violates #54's strict boundary. A separate SDK/server runner would need new server lifecycle, permission handling and CLI argument translation despite the existing CLI already providing the events needed here. The fixed hook avoids those mechanisms and adds no loop plugin configuration surface.

### Consume a completed native result and remove text parsing

Accept only a root-session `tool_use` event for `StructuredOutput` with `state.status: "completed"` and the native `state.metadata.valid: true` marker. Write its object input through the existing `writeReply()`. The controller still runs `readReply()` with the existing role validator; do not implement another schema validator.

Prose and text-only JSON cannot supply a reply. An emitted session error, absent successful native completion, or nonzero child exit must fail without writing a reply. When no native completion succeeds, report the native error when present; otherwise name missing native output. A successful completion can follow an earlier rejected tool attempt within the same harness turn; the adapter launches no retry. Preserve the child's exit status and usage behavior already provided by `runHarness()`. Do not suppress a session error merely because a completion appeared elsewhere in the stream.

Keep the worker prompt's semantic instructions, and replace the adapter's bare-JSON appendix with a short instruction to finish through OpenCode's native structured-output tool after completing the work and any required presentation. No separate presentation event or file is needed.

### Preserve arguments, but reject modes that cannot load the local hook

Forward the existing compatible CLI arguments unchanged, including model, agent, variant and permission options. Refuse `--pure` and remote `--attach` before starting a model turn, including their equals forms: the first disables the hook and the second runs prompt handling in another process that cannot receive this local overlay. Name the incompatible setting. Do not strip either option, alter permissions or silently use a text protocol. These are explicit compatibility limits of this proposal.

No OpenCode version probe, extra model call or retry is added. The minimum working behavior is tested against the installed OpenCode 1.18.34; native output being unavailable is reported by the existing failure path.

### Verify the boundary through existing tests and one real native invocation

Extend the adapter harness stub to exercise the child overlay and load the compiled hook, then emit native completed/failed tool events alongside text. Keep tests at the worker boundary: supplied schema reaches the hook, inherited configuration survives, compatible arguments pass through, and only native output becomes the reply. Include #54's cut-report-plus-JSON text as a failure fixture, then a successful variant with a separate native result. Assert one child invocation and preserved usage on errors.

Use an implementation-cycle test to show that a native-reply success continues through commit/check/review and that an adapter failure preserves edits without committing or advancing that attempt. Reuse the existing repository fixtures and validators.

During apply, capture one real OpenCode 1.18.34 run in a disposable directory using the configured MiMo model, asking for a cut report and a small schema reply. Inspect the structured tool completion, reply object and usage. Keep a small redacted recording under `test/recordings/`, not the whole private implementation transcript. This checks that the compiled hook loads in the actual harness; stub tests alone cannot establish that.

## Risks / Trade-offs

- The CLI has no schema flag, so the hook depends on the documented message-hook shape and versioned native tool events. Verify both in the real smoke run and keep the adapter failure explicit if a later version changes them.
- Native auto-compaction can create follow-up messages without inheriting the original format in OpenCode 1.18.34. A turn that then produces no native result still fails explicitly; this proposal adds no compaction workaround or text fallback. That limitation is separate from accepting wrapped prose as a reply.
- Existing plugins can interfere with message format or tool output. Preserve them and use the native success marker plus the controller's reply validator; a missing or failed native result does not imply success.
- `--pure` and `--attach` cannot be retained as successful modes with this approach. Document the named refusals; ordinary `-m`/`--model`, `--agent`, and restriction wrappers continue working.

## Migration Plan

Upgrade the package after implementation and archive. Existing normal OpenCode agent commands need no edits or plugin installation. Update README's unsupported-schema claim and the compatibility limits. Keep existing stopped runs intact; resume them only when their user chooses. Rollback restores the previous package and its strict final-text protocol.

## Cut Pass

Every item below serves amended **Shipped adapters**, existing **Worker interface**, or the explicit #54 proposal request.

| Item kept | Clause/request served | Simpler version and concrete failure |
|---|---|---|
| Native `json_schema` format | Shipped adapters: enable native enforcement | Prompt-only JSON repeats #54. |
| Fixed bundled message hook | Shipped adapters: enforce while preserving CLI arguments | CLI-only cannot set the format; server rewrite adds lifecycle and argument translation. |
| Child-only inline overlay | Shipped adapters: no persistent edits, preserve settings | Replacing configuration discards user restrictions/plugins. |
| JSONC parser dependency | Shipped adapters: preserve inherited inline settings | `JSON.parse` rejects comments and trailing commas accepted by OpenCode. |
| Schema plugin option | Worker interface: supplied schema | Hardcoding one role's schema breaks the other roles. |
| Root session id in hook closure | Shipped adapters: delegated sessions keep their formats | Applying to every session forces the root protocol on delegated work. |
| Optional child environment parameter | Shipped adapters: process-scoped enablement | Mutating the parent environment leaks the overlay to other workers. |
| Completed native tool input | Shipped adapters: native result only | Parsing `text` recreates the contamination boundary. |
| Native completed-status check | Shipped adapters: successful native result | Accepting attempted tool input returns work that never completed. |
| Native valid-marker check | Shipped adapters: successful native result | A generic completed tool part alone does not establish native format completion. |
| Session-error check | Shipped adapters: failed output is an execution failure | A result from earlier in a failed session would hide that failure. |
| Missing-result check | Shipped adapters: native result only | A zero child exit alone falsely claims a usable worker reply. |
| Inline-configuration parse-error check | Shipped adapters: preserve inherited settings | Replacing malformed input with defaults silently discards settings. |
| `--pure` refusal | Shipped adapters: incompatible settings fail explicitly | The local hook is disabled and work cannot return the required native reply. |
| Remote `--attach` refusal | Shipped adapters: incompatible settings fail explicitly | The remote prompt handler cannot receive the child overlay. |
| Existing usage collector | Shipped adapters: native accounting | Removing it loses costs; a second lookup duplicates the pipeline. |
| Existing reply validator | Worker interface: role shape | Trusting an object alone accepts the wrong role reply; a new validator duplicates it. |
| Adapter regression fixture/checks | #54 acceptance and Shipped adapters | A happy-path JSON fixture misses the reported boundary failure. |
| Implementation-cycle check | #54 acceptance | Adapter-only tests cannot establish commit/check/review progression or preserved edits. |
| Real native smoke recording | Shipped adapters: actual enablement | Stubs cannot reveal a hook that the installed OpenCode refuses to load. |
| README update | #54 fix usability | Leaving it unchanged says native enforcement is impossible. |
| Proposal record | Explicit proposing request | Tasks alone omit scope and motivation. |
| Delta spec record | Repository contract rule | Code-only work leaves the prose-failure contract unchanged. |
| Design record | Explicit proposing request; required decisions | Omitting it leaves the hook and compatibility choices undecided. |
| Task checklist record | Explicit proposing request | Prose alone is not a native apply checklist. |
| `.openspec.yaml` record | Explicit native proposing request | Omitting native metadata loses the selected schema and change identity. |
| Task 1.1: hook/overlay/child environment | Shipped adapters: enable native output without losing settings | Consumption alone still leaves the harness in text mode. |
| Task 1.2: native reply, refusals and docs | Shipped adapters and #54 acceptance | Hook-only work leaves the final-text parser rejecting successful native turns. |
| Task 1.3: real harness smoke/recording | Shipped adapters: actual enablement | A stub can accept a plugin that the installed harness cannot load. |
| Task 2.1: implementation-cycle regression | #54 acceptance | Adapter tests do not cover commit/check/review progression or preservation of edits. |
| Task 2.2: integrated checks and cut pass | Repository-required check and explicit proposing workflow | An isolated adapter test misses regressions in shared `runHarness()`. |

Removed: the abandoned prose-extraction scaffold and approach, extra server/SDK lifecycle, reply-repair retries and a retry-count override, a new controller validator, presentation sidecar files, persistent plugin installation, version probes and compaction workarounds. They either conflict with #54's boundary or add mechanisms unnecessary to the chosen native-output route.
