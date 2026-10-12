# Design

## Context

See `proposal.md` and issue #54 for the failure. The shipped OpenCode adapter requests bare JSON through `opencode run --format json`; the unfinished implementation instead injects a native format through a file plugin and consumes completed tool input. The controller already validates role replies and preserves failed-worker edits. Reuse those boundaries.

[Verified live behavior, OpenCode 1.18.34] The compiled message hook loaded, but saving its plain `{ type: "json_schema", schema }` format failed with `SchemaError(Expected OutputFormatJsonSchema, got ...)` at `Session.updateMessage`, before inference. OpenCode represents the format as a runtime schema class; its defining package is private. Adding a retry field does not construct that instance. Do not use internal imports, prototype tricks or an installation patch.

A separate disposable API proof submitted that serialized format to `POST /session/{sessionID}/message` with `openrouter/xiaomi/mimo-v2.6-flash`. OpenCode returned `info.structured: {"planProblem":null}`, a completed `StructuredOutput` part and reported tokens/cost. This establishes the API enablement path, not the compiled adapter's delivery behavior. The no-work proof did not emit its requested assistant cut report, and aborting its event subscription immediately on the HTTP response did not drain all completion events; apply must verify presentation and stream completion with the actual adapter.

[Verified during apply] The compiled adapter's OpenCode 1.18.34/MiMo smoke printed the requested cut report through bash stdout, then returned the native `{ "planProblem": null }` object separately. Both model-step reports reached the usage file, the adapter exited zero and its owned listener was closed afterward. The small redacted API recording in `test/recordings/opencode-api-native.json` also passes a replay test. The smoke establishes the requested transcript/reply boundary; it does not promise that MiMo emits ordinary assistant prose before a tool call.

Primary references: [versioned prompt API types](https://github.com/anomalyco/opencode/blob/v1.18.34/packages/sdk/js/src/v2/gen/types.gen.ts), [runtime format definition](https://github.com/anomalyco/opencode/blob/v1.18.34/packages/schema/src/v1/session.ts), [prompt engine](https://github.com/anomalyco/opencode/blob/v1.18.34/packages/opencode/src/session/prompt.ts), [headless CLI permission behavior](https://github.com/anomalyco/opencode/blob/v1.18.34/packages/opencode/src/cli/cmd/run.ts), [server command](https://github.com/anomalyco/opencode/blob/v1.18.34/packages/opencode/src/cli/cmd/serve.ts), [server lifecycle](https://github.com/anomalyco/opencode/blob/v1.18.34/packages/opencode/src/server/server.ts), [SDK server helper](https://github.com/anomalyco/opencode/blob/v1.18.34/packages/sdk/js/src/server.ts), [server authentication](https://github.com/anomalyco/opencode/blob/v1.18.34/packages/opencode/src/server/auth.ts).

## Goals / Non-Goals

Submit the schema at OpenCode's supported decoding boundary and deliver its native object separately from presentation text. Keep one worker prompt, existing restrictions, native usage names and controller progression. Require no persistent installation or configuration change.

This does not repair the labeler implementation, its plan-mode claim or checklist, resume its stopped run, add retries, or guarantee that a model always emits presentation text or completes native output.

## Decisions

### Own one server and submit one API prompt

Replace this adapter's `opencode run` invocation with one `opencode serve --hostname 127.0.0.1 --port 0 --mdns=false` child in the current worktree. Read the actual listening URL from that child rather than assume a port: 1.18.34 tries 4096 before selecting a free port. Keep the child in the worker's process group. Inherit environment and configuration unchanged, including `OPENCODE_CONFIG_CONTENT` and `OPENCODE_PURE`. Supply the worktree directory on API requests. Preserve configured server authentication by deriving the Basic header from the inherited password and username, without printing credentials.

Use built-in Node fetch/stream facilities for the small API surface. Create a fresh session, subscribe to its directory's event stream before submitting the prompt, and call the synchronous prompt endpoint once with the supplied schema as `format: { type: "json_schema", schema }`. Do not set `retryCount`, submit a repair prompt, or look up usage afterward. The API creates the native runtime instance. Delegated sessions receive no root schema injection.

Wait for the owned child's ready line, refusing startup errors, early exits or a five-second readiness timeout, matching the SDK's startup default without adding a configuration knob. During execution, an unexpected child exit or premature event-stream closure fails the worker. Finish a successful HTTP prompt only after its root-session idle event has drained the stream; an HTTP failure cancels the subscription instead of waiting for an idle event that may never arrive. Always close the subscription and terminate/reap the child on success, failure and interruption, with bounded termination if graceful shutdown does not finish. Persist observed usage before reporting failure. A deliberate cleanup exit is not an unexpected harness exit.

This lifecycle is now necessary: the tested CLI has no schema option, and the smaller hook route failed in the installed harness. The official SDK server helper overwrites `OPENCODE_CONFIG_CONTENT` even when no config is supplied; using it would require parsing and reconstructing inherited configuration. A direct child plus fetch avoids that overlay and a new dependency. Keep `src/adapters/common.ts` unchanged; use its existing counter, usage, reply and failure helpers after cleanup, while other adapters retain `runHarness()`.

### Select the response's native object and collect stream usage

Write only the completed prompt response's `info.structured` through `writeReply()`, provided the response and root session have no error. The prompt engine sets this field on native tool success, so a second completed-tool or metadata-marker gate duplicates the native boundary. Missing structured output is an explicit adapter failure even if response text is valid JSON. API errors, `info.error` and root `session.error` are execution failures; a failed tool attempt can still precede a successful native result. Unexpected nonzero server exits preserve their status.

Keep parsed native event payloads as JSON lines in the transcript, alongside child diagnostics and the final prompt response. Do not translate them into a second CLI event format. Never parse text for a reply. Retain the worker's semantic prompt and a short instruction to finish with `StructuredOutput` after the work and any required presentation.

Collect root-session `step-finish` parts from `message.part.updated` events, replacing earlier reports for the same part id in a map; sum each final record's numeric token leaves and reported cost once. This preserves the old adapter's root-session per-step accounting and avoids counting event updates or final-message totals twice. Ignore delegated-session usage as the old CLI did. No additional usage API lookup, cumulative session summary or pricing calculation is used.

### Define supported arguments and preserve headless permissions

Support `-m`/`--model`, `--agent`, `--variant` and `--auto`, with value/equals forms and explicit boolean false where applicable; translate their meaning to the API. Support `--pure` selections by forwarding them to the owned server, and preserve enabled pure mode from the environment. Native enforcement no longer depends on plugins. Unspecified model/agent/variant selections remain unspecified so OpenCode uses its existing configuration defaults. Shell restriction wrappers still encompass the adapter and its child.

Reject all other arguments before spawning, naming the offending option. This includes `--attach` (even localhost), `--session`, `--continue`, `--fork`, `--command`, `--dir`, file attachments, interactive modes and presentation/server-tuning options. Do not emulate the whole run CLI, ignore unknown flags, change directory, or add compatibility settings. This explicit breaking limit replaces the old passthrough promise only for OpenCode; normal documented worker commands keep their model/agent/variant behavior.

Create the root session with the same headless deny rules for `question`, `plan_enter` and `plan_exit` as the CLI. Track the root id and child sessions announced under it. Reply `reject` to their `permission.asked` events by default; with explicit `--auto`, reply `once`. These replies only answer requests that OpenCode allows to reach the ask state and do not replace its configured deny rules. Do not apply a blanket allow configuration or add an interactive prompt. Unknown sessions do not receive permission replies.

### Verify the API boundary, lifecycle and loop integration

Replace the plugin-loading stub with a small fake OpenCode server in the existing adapter helper. It records startup arguments and API requests, serves the actual session/prompt/event protocol and can apply worker edits. Clear inherited pure/config/auth environment by default in tests; set values explicitly in the tests that need them. Verify the exact schema reaches the prompt API, inherited JSONC and settings reach OpenCode unchanged, supported selections retain meaning, native output works in pure mode and unsupported flags fail before launch.

Exercise streamed cut text separately from the native response, missing native output, native/session/API failures, an unsuccessful tool attempt before a successful result, repeated step reports, other-session events and usage on failure. Verify default and explicit-auto permission replies for root and child sessions, plus unchanged configured denies. Check readiness failure, unexpected exit, premature stream closure, response-before-idle ordering and child/subscription cleanup after success, failure and interruption. Use the existing harness helper for other adapters.

Rewire the existing #54 implementation-cycle regression to the API fixture: failure retains worker edits without commit/check/review, native success follows their normal sequence, and a wrong-role object still fails controller validation. Demonstrate the regression fails when native response selection is replaced with final-text parsing.

During apply, run the compiled adapter against installed OpenCode 1.18.34 with the configured MiMo model in a disposable directory. Ask for a cut report and a small schema reply and inspect emitted presentation, native object, drained step records, usage and server cleanup. Retain a small redacted API recording and replay it in adapter tests. The preliminary API proof cannot complete this task because it did not exercise the adapter or presentation/stream draining.

## Risks / Trade-offs

- More lifecycle code than the rejected hook: cover early exits, cancellation and cleanup through the fake server and actual compiled-adapter smoke; add no reusable server framework or lifecycle options.
- Argument translation replaces arbitrary passthrough: document the supported set and fail unsupported options by name before starting a model turn.
- Native auto-compaction can lose the format in 1.18.34: missing output still fails; add no compaction workaround or text fallback.
- Models or existing plugins can omit presentation or native output: preserve their transcript and report the native failure; do not manufacture a report or treat a text object as success.
- Event updates and HTTP completion can race: deduplicate usage by part id and drain through root idle, without a reconnect/replay or auxiliary usage query.

## Migration Plan

Replace the unfinished hook implementation during apply, including removing `opencode-schema.ts`, the overlay, its JSONC dependency and hook-specific tests/documentation. Existing documented model/agent commands need no installation or config change; commands with other run flags must use the documented supported set or receive the explicit compatibility error. Verify, sync specs and archive before integration. Keep the stopped labeler run intact. Rollback restores the previous package and its strict text protocol.

## Cut Pass

Every retained item serves amended **Shipped adapters**, existing **Worker interface**, **Run control**, or the explicit #54 revision request. This list was reconciled against the implemented adapter and its fixtures during apply. There are no new persistent loop state fields or configuration options.

| Item kept | Clause/request served | Simpler version and concrete failure |
|---|---|---|
| One owned local server | Shipped adapters: native enforcement, owned lifecycle | CLI-only has no schema option; the hook fails runtime validation. |
| Fixed loopback binding | Shipped adapters: worker-scoped local harness | A configured external binding exposes the worker's server beyond its local process. |
| Port-zero startup and actual listening port | Shipped adapters: owned harness | A fixed or assumed port can collide with another server. |
| Disabled mDNS | Shipped adapters: worker-scoped local harness | Inherited discovery advertises a temporary worker server that no external client needs. |
| Listening URL and readiness/error check | Shipped adapters: startup failure | Sending before readiness fails; silence otherwise leaves startup unbounded. |
| Five-second readiness bound | Shipped adapters: startup failure | Waiting only for exit hangs on a live child that never becomes ready; use the SDK's existing default, no knob. |
| Cleanup and bounded child termination | Shipped adapters: no surviving harness | Stopping only the HTTP request leaves the owned server running. |
| Child close promise | Shipped adapters: owned lifecycle | Observing only exit can finish before child streams close and the process is reaped. |
| Cleanup phase flag | Shipped adapters: expected shutdown is not failure | Treating the adapter's own termination signal as an unexpected exit rejects successful turns. |
| Failure message/status record | Shipped adapters: preserve exit status and usage | Exiting inside an event callback skips cleanup and reported usage. |
| Shared abort controller | Shipped adapters: failure/interruption cleanup | Killing only the server leaves the HTTP response and subscription waiting. |
| Abort-to-readiness promise | Shipped adapters: startup failure | Waiting only for the ready line delays a known spawn failure until the readiness timeout. |
| SIGINT/SIGTERM handlers | Shipped adapters and Run control: interrupted cleanup | Default adapter-only termination can leave its child running when invoked outside the loop's process-group stop. |
| Three-second forced cleanup timer | Shipped adapters: bounded child termination | A child ignoring SIGTERM otherwise blocks cleanup indefinitely. |
| Inherited environment without overlay | Shipped adapters: preserve configuration | Use this simpler version; rebuilding JSONC discards accepted syntax or settings. |
| Directory on API requests | Shipped adapters: worktree execution | Server startup alone does not select the request's project instance. |
| Existing-auth Basic header | Shipped adapters: preserve settings | A password-configured server otherwise rejects the owned client. |
| Fresh root session id | Shipped adapters: one worker prompt | Reusing a previous session introduces unrelated history and reply state. |
| API schema format | Shipped adapters: native enforcement | Text instructions repeat #54; hook injection bypasses runtime decoding. |
| One prompt with native instruction | Shipped adapters: one native worker reply | A follow-up repair prompt violates the one-turn/no-retry boundary. |
| Native `info.structured` selection | Shipped adapters: native result only | Parsing response text repeats #54; an extra tool gate duplicates native success. |
| API error check | Shipped adapters: execution failures | A failed HTTP request cannot supply a successful native result. |
| Final response error check | Shipped adapters: execution failures | HTTP 200 can carry a saved native-output error. |
| Root session error check | Shipped adapters: execution failures | Judging only transport status loses a streamed root-session failure. |
| Missing-native-result check | Shipped adapters: native result only | Successful transport can still return no usable object. |
| Stream subscription before prompt | Shipped adapters: transcript/accounting | Subscribing afterward loses earlier worker steps and permission requests. |
| Prompt and stream completion promises | Shipped adapters: native reply/accounting boundary | Waiting for either alone can lose the native response or queued step reports. |
| Streaming UTF-8 decoder | Shipped adapters: transcript preservation | Decoding each network chunk independently corrupts characters split between chunks. |
| Incomplete SSE block buffer | Shipped adapters: event accounting | Parsing individual network chunks drops events split between chunks. |
| Root idle completion check | Shipped adapters: accounting boundary | Cancelling on HTTP completion alone loses queued completion events, as the proof showed. |
| Premature stream closure check | Shipped adapters: execution failures | A closed stream otherwise drops permissions or accounting while a model continues. |
| Native JSON-line transcript and final response | Worker interface: kept output; #54 evidence | Reply-only output hides the work and presentation needed to diagnose failure. |
| Latest step reports keyed by part id | Shipped adapters: per-step accounting | Summing event updates counts the same step twice; final-message totals miss earlier steps. |
| Root-session accounting filter | Shipped adapters: preserved accounting | Including child events changes the old CLI's accounting boundary. |
| Existing counter/usage helpers | Shipped adapters: native numeric leaves | Fixed token fields drop additional/nested counters; new helpers duplicate existing ones. |
| Existing reply/controller validators | Worker interface: JSON object and role shape | Trusting native transport accepts a wrong-role object; another validator duplicates the controller. |
| Model argument mapping | Shipped adapters: supported selections | Ignoring it runs a different model than the worker command selects. |
| Agent argument mapping | Shipped adapters: preserved restrictions | Ignoring plan selection enables work the review command meant to prohibit. |
| Variant argument mapping | Shipped adapters: supported selections | Ignoring it silently changes the requested model variant. |
| Pure forwarding/environment inheritance | Shipped adapters: preserved pure selection | Refusal is unnecessary now; stripping pure loads plugins the command disabled. |
| Explicit auto-approval option | Shipped adapters: headless permission semantics | Ignoring explicit auto denies requested work; enabling it by default weakens restrictions. |
| Headless question/plan-transition denies | Shipped adapters: preserved restrictions | General permission handling alone allows workflow questions or plan switching. |
| Permission reply handler | Shipped adapters: unattended root/child permissions | Leaving ask requests unanswered hangs; blanket allow overrides configured denies. |
| Known descendant session ids | Shipped adapters: delegated permissions | Root-only handling hangs delegated work; answering every session affects unrelated sessions. |
| Unsupported argument check | Shipped adapters: explicit compatibility failures | Silently discarding run flags changes their intended session or restrictions. |
| Fake API server and request log | #54 and revised API acceptance | A plugin stub cannot verify HTTP schema decoding or lifecycle. |
| Controlled test environment | Revised API acceptance | Inherited config/pure/auth settings change fixture outcomes. |
| Canonical test-directory comparison | Shipped adapters: worktree execution | Comparing a temporary directory's unresolved alias rejects the same directory returned by `process.cwd()`, as macOS CI and a symlinked-temp reproduction showed. |
| Native reply regression | Shipped adapters: native result | A transport-only test cannot establish object selection. |
| Cut-report and text-only regression | Shipped adapters and #54 | A happy-path object misses the reported prose boundary. |
| Native/API/session failure regression | Shipped adapters: error reporting | A success-only test cannot establish failure usage and missing replies. |
| Repeated-step accounting regression | Shipped adapters: per-step boundary | One usage record cannot reveal double-counting of an update. |
| Unrelated-session regression | Shipped adapters: worker-scoped output/restrictions | Root-only input cannot reveal unrelated-session pollution. |
| Default and explicit-auto permission regression | Shipped adapters: preserved permission behavior | Reply-only tests miss blocked requests or unintended approval. |
| Configured-deny regression | Shipped adapters: preserved restrictions | Testing ask replies alone cannot establish that denies remain intact. |
| Readiness and unexpected-exit regression | Shipped adapters: lifecycle failures | Success-only tests cannot establish a failed server stops the worker. |
| Response-before-idle and stream-close regression | Shipped adapters: accounting and execution failure | An ordered stream misses lost completion events or premature closure. |
| Success/failure/interruption cleanup regression | Shipped adapters and Run control | Reply-only tests miss surviving servers or subscriptions. |
| Implementation-cycle fixture and parser mutation | #54 acceptance | Adapter-only checks cannot establish commit/check/review progression or preserved edits. |
| Redacted compiled-adapter live recording | Shipped adapters: actual native enablement | The prior stubs passed despite a real runtime rejection; retain only presentation/native tool parts and step accounting, replacing real IDs and omitting paths and unrelated plugin events. |
| README revision | #54 usability and argument migration | Hook documentation becomes false and unsupported flags otherwise surprise users. |
| Proposal record | Explicit proposal/revision request | Tasks alone omit motivation and breaking compatibility. |
| Delta spec record | Repository contract rule | Code-only edits leave the old passthrough and reply contract unchanged. |
| Design record | Explicit revision request | The API introduces lifecycle/permission decisions that tasks cannot leave implicit. |
| Task checklist record | Explicit OpenSpec workflow | Prose alone cannot track the remaining native apply work. |
| Existing `.openspec.yaml` | Explicit OpenSpec workflow | Dropping it loses the change's native schema identity. |
| Task 1.1: owned API harness | Shipped adapters: native enablement/configuration | Native consumption alone still leaves no supported format submission. |
| Task 1.2: reply/events/permissions/docs | Shipped adapters: native reply/accounting/restrictions | A server-only task cannot deliver replies or complete headless work. |
| Task 1.3: live compiled adapter | Shipped adapters: actual enforcement | A fake server cannot expose installed-harness incompatibility. |
| Task 2.1: loop regressions | #54 acceptance | Protocol tests cannot establish preserved edits and normal progression. |
| Task 2.2: integrated checks/cut pass | Repository check and cut-pass rules | Isolated protocol checks miss integration and artifact drift. |

Removed from the route during revision/apply:

- Bundled format hook: the installed harness rejects its runtime format object.
- Root-schema closure: the API supplies the schema on the root prompt alone.
- Plugin schema options: the root prompt already carries the supplied schema.
- Configuration overlay: unchanged environment inheritance preserves the existing settings.
- JSONC dependency/reconstruction: no overlay needs parsing; OpenCode parses its own configuration.
- Pure-mode refusal: native API output does not depend on plugins.
- Completed-tool-input selector: the prompt response already supplies the native result.
- Extra completed-status/metadata gates: the response's structured field comes from native tool success.
- CLI JSON-event translation: native events and the response can remain in the transcript directly.
- Arbitrary run-argument passthrough: run flags cannot be forwarded to a serve/API invocation; supported mappings and named refusals replace it explicitly.
- SDK server helper/dependency: it overwrites inherited inline configuration; built-in spawn/fetch need no new package.
- Common-harness environment changes: other adapters keep their existing harness path.
- Unused prompt-response `parts` type field: reply selection never reads it.
- Mutable startup-timer declaration: one constant implements the same readiness bound.
- Fake-server password/username state fields: the controlled authorization-header check already verifies authentication without recording those credentials again.
- Step-start entries in the live replay recording: presentation/native tool parts and step-finish reports establish this recording's acceptance need.

Still cut:

- Text extraction/fallback: violates the native-only reply boundary.
- Repair turns/retry overrides: violate the one-prompt boundary or alter native retry behavior without a need.
- Internal runtime-class tricks: the supported API already decodes the format.
- Persistent plugin/config edits: the worker inherits its configuration directly.
- Generic server abstraction: only this adapter needs the fixed native API path.
- Lifecycle configuration knobs: the fixed readiness/termination bounds serve the owned process.
- Version probes: the compiled installed-harness smoke establishes compatibility without another runtime command.
- Usage lookups: streamed step records already provide the invocation's usage.
- Price calculation: the harness reports cost directly.
- Cumulative usage summaries: they duplicate the per-step accounting boundary.
- Compaction workarounds: no required native result may be replaced by text when compaction loses the format.
