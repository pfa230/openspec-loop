# Design

## Context

See `proposal.md` for motivation. The implementation currently reads only the last `turn.completed.usage` in `src/adapters/codex.ts`; `runHarness` in `src/adapters/common.ts` writes usage before judging exit status. `src/step.ts` accepts only `tokens` and `costUsd`, and `src/controller.ts` reads those usage files again for step formatting and cumulative role totals. There is no separate cost state to migrate.

[verified] Installed Codex CLI 0.162.1, using `codex app-server generate-json-schema --experimental --out <temporary-directory>`, exposes `account/usage/read` with optional `params.threadId`. The response's `threadUsage` contains `threadId` and optional/nullable `estimatedUsageUsdMicros`; its description conditions availability on the thread's billing route. The [official app-server documentation](https://learn.chatgpt.com/docs/app-server) establishes the initialization handshake and that account usage requires Codex-service-backed authentication, excluding API-key-only and Bedrock authentication. Its public example covers account summaries rather than establishing thread estimates for exec. The [exec documentation](https://learn.chatgpt.com/docs/non-interactive-mode#make-output-machine-readable) shows a thread ID in `thread.started` and tokens in `turn.completed`.

[verified] On 2026-10-11, a read-only app-server lookup, with experimental API capability enabled and existing local authentication, requested benchmark exec thread `01a1292e-8942-7633-afa1-9102346fcbb7`. Its rollout metadata identified source `exec`, CLI 0.162.1 and a `native-stage-live-cache/openspec-loop-bench/runs/` working directory. The API succeeded and returned `threadUsage: null` and an account summary. No inference was started. This verifies the request path and an unavailable case; it does not demonstrate a retrievable USD estimate or establish why this thread lacks a billing route.

## Goals / Non-Goals

**Goals:** Reuse a separately available Codex estimate without changing the exec worker invocation, preserve unavailable values and worker outcomes, and carry the estimate label through existing usage files and totals.

**Non-Goals:** Price tables, credits-to-USD calculations, additional inference runs for cost collection, switching the worker to app-server inference, historical backfills, cumulative cost attribution for resumed threads, authentication provisioning, benchmark changes outside this repository, and a reporting framework.

## Decisions

### One bounded lookup after a fresh exec

Keep the exec command, schema enforcement, reply path and token extraction. Read `thread.started.thread_id` from that invocation's stream. For a fresh thread, spawn the same `codex` executable with `app-server --listen stdio://`, in the same cwd and environment, using existing Codex home/config/authentication. Initialize with client metadata and `capabilities.experimentalApi: true`, await the response, send `initialized`, and request `account/usage/read` with that exact ID. Match response request IDs and `threadUsage.threadId`; never substitute an account total or the last thread.

Use a fixed five-second deadline covering startup and the lookup, with no retries or configurable timeout. Terminate the helper on success, error or deadline; force termination if it does not exit after a short shutdown grace. Keep helper stdout separate from exec events and avoid dumping account summaries or raw authentication errors. A short unavailable-reason line in the existing transcript is sufficient. Missing thread ID skips lookup. A resume invocation skips cost lookup because its thread estimate includes earlier work; no before/after lookups are introduced.

Allow `runHarness`'s usage callback to return a promise and await it before writing usage and judging the harness exit. Existing synchronous callbacks continue working. Catch optional lookup failures within Codex's collection path so they cannot replace the exec exit status or suppress token usage. A failed exec that emitted a fresh thread and tokens uses the same bounded collection path.

Alternative: move inference to app-server, or create a general RPC client. Both change more than the missing collection path requires. Exec-only collection cannot supply the separately exposed estimate.

### Keep the existing dollar field, add one marker

Accept only a non-negative safe integer `estimatedUsageUsdMicros` for the matching thread. Divide by 1,000,000, write the result as `costUsd`, and add optional `costEstimated: true`. Explicit zero remains a valid estimate. Null, missing, invalid, negative, unsafe or credit-only values leave both fields absent. Retain the last completed exec turn's token counters without replacing them with thread/account totals.

Extend `Usage` and its strict validation for this single optional true marker, valid only alongside a valid dollar cost. Existing files without it retain their behavior. This is enough for machine consumers to identify estimates; a second amount field, source enum and stored thread ID would duplicate the existing amount or transcript evidence.

### Label step costs and totals containing estimates

Render marked step costs as `estimated cost $<amount>`. When any contributing cost for a role is marked, render the existing sum as `estimated cost $<sum>`. Keep all token totals and missing-cost counts. Unmarked costs retain existing output. Compute the marker while reading the existing usage files, without extending persisted run state. A mixed total is conservatively labeled estimated; separate subtotals add no requirement from #51.

### Availability remains conditional

The implementation must reproduce a lookup for an actual completed exec thread under the benchmark's authentication and record a returned estimate or the specific limitation encountered. A null response is evidence of missing thread usage, not proof that Codex never provides estimates. The chosen behavior remains a bounded optional lookup regardless of the account's availability: there is no fallback pricing calculation or promise that all mixed runs will report total cost. Update the adapter comment and README with this distinction and the authentication constraint.

## Risks / Trade-offs

- Experimental API changes or unavailable billing routes: treat unsupported methods, missing data and rejected authentication as unavailable; preserve exec behavior and document the observed limitation.
- Backend latency: the fixed deadline bounds the extra delay; a delayed estimate can remain unavailable, with no polling loop.
- Cumulative thread values: collect only fresh-thread estimates, preventing repeated cost attribution for resumed workers.
- Optional lookup subprocess leaks: close and terminate the helper on every completion path; test a stalled helper.
- Estimate metadata reaches older external parsers: repository consumers accept the additive marker; document it for external strict parsers. Existing usage records require no migration.

## Migration Plan

Ship the adapter, additive usage format, formatting and README changes together. Run existing and focused tests through `npm test`; use a live lookup to qualify availability, not to replace deterministic fixture tests. Rollback removes the optional lookup and marker handling together. No rewrite of historical usage files or run state is needed.

## Cut Pass

The following inventory covers the retained additions; each row names its authority and why the simpler alternative fails.

| Item retained | Contract clause or request | Simpler alternative and concrete failure |
| --- | --- | --- |
| Codex-only app-server lookup | Shipped adapters; #51 existing estimate | Exec events alone have no USD estimate. |
| Initialization handshake | Shipped adapters, exact-thread collection | Sending the request alone is rejected before initialization. |
| Experimental capability opt-in | Shipped adapters, exact-thread collection | Leaving it off can reject the experimental thread parameter. |
| Request response-ID check | Shipped adapters, estimate belongs to invocation | Accepting another RPC reply can mistake unrelated data for thread usage. |
| Returned thread-ID check | Shipped adapters, estimate belongs to invocation | Accepting another thread's estimate attributes its spending to this step. |
| Fixed five-second deadline | Shipped adapters, bounded optional lookup | An unbounded lookup can prevent worker completion. |
| Helper termination and shutdown grace | Shipped adapters, bounded optional lookup | Waiting without termination leaves a stalled helper running. |
| Resume exclusion | Shipped adapters, no cumulative double counting | Treating a resumed thread total as a new step counts earlier work again. |
| Asynchronous usage callback | Shipped adapters, usage before exit judgment | Synchronous extraction cannot finish the lookup before usage is written or the adapter exits. |
| Lookup failure isolation | Shipped adapters, preserve worker results | An uncaught helper failure discards tokens or replaces exec's exit status. |
| Safe non-negative USD-micro check | Worker interface; Shipped adapters, usable estimate | Passing malformed or rounded unsafe values onward can fail the worker or misstate its cost. |
| Division by 1,000,000 | Progress and usage reporting, denomination exception | Treating micros as dollars overstates cost a millionfold. |
| Existing `costUsd` record field | Worker interface; #51 existing usage flow | A new parallel amount field duplicates storage and aggregation. Reuse the existing field. |
| Optional `costEstimated: true` field | Worker interface; #51 estimate visible to consumers | A dollar amount alone loses whether it was estimated. |
| Marker requires a cost | Worker interface, valid usage record | A marker alone can label unavailable data as a reported estimate. |
| Step estimate label | Progress and usage reporting | Plain `cost` presents an estimate without its qualification. |
| Derived any-estimate flag in role aggregation | Progress and usage reporting, estimated totals | Summing only amounts loses the qualification across attempts and resumes. |
| Existing transcript's short lookup outcome | #51 document unavailable estimates | A missing amount alone cannot distinguish unsupported lookup from no billing data; no new diagnostic file is needed. |
| Live result documented in README | #51 demonstrate retrieval or limitation | Schema existence alone does not prove estimate availability for exec authentication. |
| Task 1.1: format, validation and cases | Worker interface | Adapter-only changes produce files the loop rejects. |
| Task 1.2: reporting, cases and documentation | Progress and usage reporting; #51 downstream clarity | File-only labeling leaves terminal totals unqualified. |
| Task 2.1: await collection and compatibility checks | Shipped adapters | Collecting after exit judgment loses usage on failed exec. |
| Task 2.2: lookup and focused fixtures | Shipped adapters | A live success case alone cannot verify attribution, zero, unavailable data or helper cleanup. |
| Task 2.3: live availability and docs | #51 acceptance | Stubbed estimates cannot establish real authentication or billing-route availability. |
| Task 3.1: package and delta checks | Repository `npm test` instruction; contract is source of truth | Focused tests alone miss shared-adapter regressions and invalid spec deltas. |
| `.openspec.yaml` schema record | Native proposing | Hand-authored files alone omit the CLI's change metadata. |
| `proposal.md` record | Attended proposal | A task list alone omits why #51 changes behavior. |
| Spec delta record | Contract is source of truth | Code-only instructions leave the cost-conversion prohibition in place. |
| `design.md` record | Attended proposal, recorded decisions | Tasks alone leave availability, attribution and total-label choices undecided. |
| `tasks.md` record | Native proposing, required apply artifacts | Unstructured design prose lacks the required implementation checklist. |

Removed from the candidate approach: a general RPC client (one method suffices), parallel cost fields and a source enum (the existing amount plus one marker suffices), separate estimated/reported subtotals (one qualified total satisfies #51), persisted thread IDs or estimate state (the transcript and usage files already supply evidence), and before/after resumed-thread lookups (fresh-thread scope avoids double counting with one request). Pricing tables, credit conversion, retries, configurable deadlines, new inference and historical backfills remain excluded because neither the amended contract nor #51 requires them. No existing implementation mechanism is removed in this planning-only change.
