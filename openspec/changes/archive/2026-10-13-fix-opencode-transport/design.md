# Design

## Context

See `proposal.md` for the motivating failure. In `src/adapters/opencode.ts`, `request()` uses global `fetch` without transport settings. The adapter opens `/event`, sends one blocking `/session/:id/message` request, and waits for both the native prompt response and root-session idle. Events are a separate HTTP response and cannot keep the pending prompt response alive.

On this machine, Node v26.10.0 bundles Undici 8.10.2 with 300,000 ms header and body inactivity defaults. The adapter's top-level catch passes only `error.message` to `stop()`, losing `cause`, code and stack. This establishes the adapter defects, but does not recover the discarded cause of the reported interruption. `src/step.ts` already captures stdout and stderr together, so retaining the error needs no new log file. The existing HTTP/SSE fixture in `test/helpers.ts` covers native output, usage, permissions and lifecycle.

## Goals / Non-Goals

**Goals:** Implement the two added requirements in `specs/loop-workflow/spec.md` through the current synchronous prompt and event flow, with deterministic tests that do not wait five minutes.

**Non-Goals:** No timeout flags, new run-state fields, retries, heartbeats, polling, asynchronous prompt migration, persistent OpenCode configuration edits or changes to other adapters. Provider-side and server-side limits remain outside the adapter's client timeout policy. The existing startup readiness and forced-shutdown bounds serve different lifecycle operations and remain in place.

## Decisions

### Use an explicitly configured HTTP dispatcher

Add Undici as a direct runtime dependency at a release whose engines range includes the package's `node >=24` support. Use its public `Agent` and `fetch`, with `headersTimeout: 0` and `bodyTimeout: 0`, for every request to the owned server. Keep response types from that same implementation. Pass the dispatcher explicitly rather than changing the process-global dispatcher. Reuse the existing AbortController and owned-server termination path: the worker's process lifetime owns the client, and stopping its server closes the local sockets. No separate client-resource guarantee or cleanup gate is added.

[Undici's client documentation](https://github.com/nodejs/undici/blob/main/docs/docs/api/Client.md) specifies that zero disables both timeouts. Using the public client API makes this policy independent of the Undici version bundled into the invoking Node runtime.

Alternatives considered: a larger finite timeout just moves the failure to a longer task; adding a timeout option makes users configure around an adapter defect. Switching to `prompt_async` adds a separate native-result retrieval path. Reimplementing fetch/body streaming with `node:http` avoids a dependency but adds response and cancellation machinery already supplied by Undici. Node's global fetch supplies no public configurable Agent constructor. One direct dependency keeps the existing API flow and provides the missing supported control.

### Preserve errors at operation boundaries

Wrap failures with an Error carrying the original error as `cause` and a message identifying the HTTP method, API path and request or response-read operation. Cover fetch rejection, HTTP error-body reads, prompt JSON consumption and event-reader failures. Keep current HTTP-status/body and session-error records. Format the caught original error using Node's built-in inspection with unlimited depth, retaining cause chains, codes and stacks without a custom recursive serializer. Write that diagnostic to stderr before calling `stop()` and entering cleanup. The existing short failure message and exit-status precedence can continue to drive the controller report; the transcript supplies the causal detail.

Only operation context and the error are added; do not dump request options, headers or prompt bodies. Shutdown-triggered aborts must not replace the originating diagnostic. Existing usage collection and the genuine unexpected-server-exit status remain authoritative.

Alternatives considered: message-only logging loses the evidence motivating this change; `JSON.stringify(error)` commonly omits Error messages, stacks and causes. A separate error file, logging framework or controller error schema duplicates the transcript already captured by `runStep()`.

### Extend the existing fixture and verify behavior

Extend `OPENCODE_STUB` with delayed response headers, a paused response body and a quiet event interval. Use a test-only import hook/preload to wrap the public Undici Agent constructor with short defaults for omitted header/body timeout options, allowing explicit adapter settings to override them. In the same preload, use Undici's public `setGlobalDispatcher` to install a client with those short defaults so requests that bypass the adapter's dispatcher also time out.

Run the control requests in child processes with the same preload and client import resolution as the adapter. Establish the short default through the imported client's Agent without overrides, the imported fetch without a dispatcher and Node's global fetch; assert `UND_ERR_HEADERS_TIMEOUT` or `UND_ERR_BODY_TIMEOUT`, not just failure. The real adapter must then succeed through the delays with native reply and usage intact. Verify the regression fails when either explicit zero setting is removed, when the explicit dispatcher is omitted, or when requests return to global fetch. This verifies the public global-dispatcher wiring on each tested Node/client version without relying on private symbols. It also catches a missing preload or a refused connection falsely counted as timeout evidence.

Add real disconnects before prompt response headers, during the prompt response body and during event-stream reading. Verify the transcript identifies the method/path and request or response-read operation and retains the nested transport name/code/stack. The real error chain already exercises cause preservation, so there is no synthetic non-Error fixture or separate formatter test. Use the existing fixture authentication settings in these tests and assert that neither the password nor its Basic-auth value appears in stdout/stderr. Extend the existing interruption coverage to waits for headers/body/events; retain the existing cleanup, HTTP/session/native failure, permission, native-output and usage regressions.

### Validate the supported Node major locally

Verify the selected Undici release's engines range before adding it. Run `npm test` with the installed runtime and with a temporary Node 24 supplied by `npm exec --yes --package=node@24 -- npm test`. Confirm the temporary runtime first with the same prefix followed by `node --version`. The command downloads Node into npm's cache, leaves project dependencies unchanged and provides minimum-major evidence before archival. This route was checked on this machine and selected Node v24.21.0. Existing Node 24 CI remains the later delivery check; no new CI matrix or runtime-version probe is added to the product.

## Risks / Trade-offs

- A live but silent server can keep a worker waiting indefinitely. This is the intentional task-lifetime policy; the existing stop/interruption path remains available, and must stay responsive during every wait.
- A new runtime dependency must work across supported Node versions. Verify its engines range, update the lockfile and run the specified local Node 24 command plus this machine's runtime before archival; later CI repeats the minimum-major check.
- Test-only timeout injection can give false confidence if it does not affect an actual client path. Controls in identically configured child processes must demonstrate the specific timeout codes for both explicit-client defaults and global fetch before accepting delayed-response success.

## Migration Plan

Ship the adapter and dependency together through the normal package build. No configuration or stored-run migration is needed. Existing stopped runs advance only on explicit resume or step after installation; this proposal does not resume them. Rollback uses the previous package version, with its known timeout and diagnostic limitations.

## Cut Pass

Each retained item below names its contract or explicit request and the concrete failure of its simpler alternative. Existing mechanisms are reused rather than added again.

| Item kept | Clause or request served | Simpler alternative and its failure |
| --- | --- | --- |
| Direct Undici dependency | OpenCode transport lifetime | Global fetch alone lacks a public configurable Agent constructor and inherits runtime defaults. |
| Explicit adapter-owned dispatcher | OpenCode transport lifetime | The default dispatcher can impose inactivity deadlines; changing the global one unnecessarily affects other callers. |
| `headersTimeout: 0` | OpenCode transport lifetime | A finite or inherited limit interrupts a prompt before its response headers arrive. |
| `bodyTimeout: 0` | OpenCode transport lifetime | Disabling only the header limit still interrupts a paused response body or quiet event stream. |
| Undici fetch and matching Response types | OpenCode transport lifetime | Rebuilding response streaming with node:http adds machinery; mixing response implementations introduces avoidable type incompatibility. |
| Existing AbortController | Run control; OpenCode transport lifetime | Unbounded waits without cancellation prevent responsive interruption. |
| Existing readiness/shutdown bounds | Shipped adapters | Removing these distinct bounds leaves startup or an uncooperative owned server hanging. |
| Method/path and operation context | OpenCode failure diagnostics | A bare fetch error cannot distinguish prompt, event or permission operations, or response-read failures. |
| Error wrapping with original cause | OpenCode failure diagnostics | Replacing the original error with a contextual message loses its transport cause and code. |
| Error-valued cancellation reason | OpenCode failure diagnostics | Converting a spawn error to a message before aborting discards its ENOENT code and stack before the top-level catch can log it. |
| HTTP request failure boundary | OpenCode failure diagnostics | A bare fetch rejection cannot identify the failed method/path. |
| HTTP error-body read boundary | OpenCode failure diagnostics | A broken error response loses the method/path and known HTTP status without read context. |
| JSON response-read helper | OpenCode failure diagnostics | Direct JSON consumption loses operation context; duplicating the same wrapper for session and prompt responses adds repeated code. |
| Event read and JSON-decode boundaries | OpenCode failure diagnostics | A rejected reader or malformed event otherwise reports only a generic termination or parse error. |
| Built-in inspection with unlimited depth | OpenCode failure diagnostics | Message-only or JSON serialization drops stacks/causes; default depth can truncate nested causes. |
| Diagnostic emission before cleanup | OpenCode failure diagnostics | Logging only the final failure message lets later abort/exit handling hide the originating evidence. |
| Error/context-only diagnostic scope | OpenCode failure diagnostics | Dumping request options adds authentication headers and prompt bodies without diagnostic need. |
| Delayed-header fixture case | OpenCode transport lifetime | Immediate responses never exercise the reported pending-header failure mode. |
| Paused-body fixture case | OpenCode transport lifetime | A header-delay test cannot establish behavior after response headers arrive. |
| Quiet-event fixture case | OpenCode transport lifetime | Prompt-only tests miss the independent event connection's inactivity behavior. |
| Pre-header connection-drop fixture case | OpenCode failure diagnostics | HTTP error responses do not exercise a rejected request with a transport cause. |
| Prompt-body connection-drop fixture case | OpenCode failure diagnostics | A pre-header drop cannot establish response-read context or cause retention. |
| Event-body connection-drop fixture case | OpenCode failure diagnostics | The existing clean event-stream end does not exercise a reader rejection. |
| Test-only Agent constructor defaults | Explicit timeout fix request | Shortening only global defaults misses omitted settings on the owned Agent; waiting for normal defaults makes regressions take five minutes. |
| Test-only Node preload arguments | Explicit timeout fix request | An in-process preload cannot establish the transport defaults of the actual adapter child. |
| Test-only short global dispatcher | Explicit timeout fix request | Constructor-only injection lets a bypass of the owned dispatcher pass with normal long defaults. |
| Identically configured child controls | Explicit timeout fix request | An in-process control cannot establish that the adapter child loaded the same preload. |
| Specific timeout-code assertions | Explicit timeout fix request | Any-failure controls can count connection refusal or unrelated errors as timeout evidence. |
| Explicit-client and global-fetch controls | Explicit timeout fix request | Checking only one fetch path leaves version-dependent global-dispatcher wiring unverified. |
| Timeout-setting and dispatcher-bypass mutations | Explicit timeout fix request | Delayed success alone cannot establish that regressions in either the zero settings or dispatcher routing are detected. |
| Interruption coverage across waits | Run control; OpenCode transport lifetime | Success-only delay tests miss waits that no longer cancel. |
| Authentication-value absence assertions | OpenCode failure diagnostics | Avoiding request-option dumps alone does not establish that the emitted diagnostics omit configured credentials. |
| Interrupted HTTP-error-body regression | OpenCode failure diagnostics | The normal prompt-body case does not traverse the HTTP error response's text reader or preserve its known status. |
| Spawn-error code/stack regression | OpenCode failure diagnostics | HTTP-only tests miss the original cause being discarded by the server-launch error handler. |
| Existing adapter regressions | Shipped adapters | New transport-only tests miss regressions in native replies, permissions, usage or owned-server lifecycle. |
| Dependency engines check | Package's Node support | A successful local Node 26 run alone can accept a dependency incompatible with the declared minimum major. |
| Temporary local Node 24 command | Package's Node support; explicit fix request | Relying only on CI cannot establish minimum-major compatibility before archival and publication. |
| Existing Node 24 CI and installed-runtime check | Package's Node support; repository check | Checking only one runtime misses the other supported major; a new matrix duplicates the existing CI. |
| README update | Explicit timeout/diagnostic fix request | Undocumented waiting and transcript behavior leave operators without the changed behavior or evidence location. |
| `npm test` | Repository's required check | Compilation or isolated adapter tests miss controller integration regressions. |
| Strict OpenSpec validation | Explicit OpenSpec proposal request | File-existence status alone accepts malformed delta specifications. |
| `.openspec.yaml` record | Explicit OpenSpec proposal request | Omitting generated metadata loses native change/schema identity. |
| Local implementation commit | Attended proposal; explicit apply request | An uncommitted proposal cannot be enrolled under Explicit enrollment. |
| Proposal record | Explicit OpenSpec proposal request | A checklist alone does not explain scope and motivation. |
| Delta spec record | Repository's contract rule | Code-only fixes leave transport and diagnostic guarantees unspecified. |
| Design record | Explicit OpenSpec proposal request | Tasks alone leave the dependency, timeout policy and failure-preservation decisions unresolved. |
| Tasks record | Explicit OpenSpec proposal request | Untracked prose cannot record implementation progress. |
| Task 1.1 | OpenCode transport lifetime | Client settings alone lack delay/interruption evidence and operator documentation. |
| Task 2.1 | OpenCode failure diagnostics | Formatting alone lacks real disconnect evidence and preservation through cleanup. |
| Task 3.1 | Repository check; package's Node support | Independent task checks do not establish whole-package compatibility or final scope consistency. |

Removed or rejected:

- Optional five-minute manual delay check: the controlled timeout regression establishes the same behavior without a second validation route.
- Larger finite timeout and timeout options: these shift the failure or require per-environment configuration instead of implementing the lifetime contract.
- Async prompts, polling and heartbeat messages: explicit client settings fix the waiting policy within the existing prompt/event flow.
- A separate failure log, logging dependency or controller error schema: stdout/stderr already enter the worker transcript.
- A custom cause serializer: Node's built-in inspection retains the required evidence and handles cycles.
- New run-state fields, runtime version probes or persistent OpenCode edits: none is needed for either requested fix.
- A new CI matrix: existing Node 24 CI already serves the supported minimum major.
- Synthetic non-Error fixtures and separate formatter tests: actual adapter failures are Errors, and the real disconnect chain establishes cause retention without re-testing built-in inspection.
- A separate client-resource guarantee, mandatory dispatcher destruction and a dedicated cleanup check: cancellation and owned-server termination already close the local connection lifecycle; existing lifecycle tests verify the observable result.
- Private global-dispatcher symbols and an assumed one-line cross-version fix: public API controls on the actual fetch paths provide the evidence instead.
- The `--allow-scripts=node` flag on the temporary-runtime command: npm 11 forwards it into Node's nested package install, where it fails with `EALLOWSCRIPTS`; the ordinary npm exec command was verified instead.
