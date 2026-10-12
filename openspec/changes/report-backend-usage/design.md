# Design

## Context

See `proposal.md` for the replacement scope. [verified] All four adapters call the existing `counters(source, names)` helper in `src/adapters/common.ts`; its fixed lists omit numerical fields already present in `test/recordings/`. Antigravity reports `total_tokens`, OpenCode reports `tokens.total`, and Claude reports `output_tokens_details.thinking_tokens`, nested cache creation counts and server tool request counts. Claude also includes per-iteration consumption inside its usage object.

[verified] `Usage.tokens` already accepts arbitrary counter names. `src/controller.ts` prints every map entry and sums corresponding names independently. The missing behavior is extraction, rather than a new usage storage format or reporting system. Claude and Antigravity use their last result, Codex its last completed turn, and OpenCode sums model-step records.

[verified] The earlier native-cost investigation found HTTP 403 from both Codex estimate endpoints under this account. Schema and status-line availability did not establish access. This replacement requires neither native cost access nor the ccusage alternative: only figures in the existing worker output qualify.

## Goals / Non-Goals

**Goals:** Remove the fixed counter-name lists while retaining the current event selection, usage-file schema, strict numerical validation, and report aggregation. Treat usage as quantitative consumption: preserve token, request and other numerical consumption counters already emitted inside usage/token objects.

**Non-Goals:** Arbitrary whole-event introspection; treating identifiers, service-tier strings, context limits or unrelated event metadata as additive spending; cost discovery outside the existing output; a unified cross-provider token definition; computing missing totals; adding a dependency or auxiliary command. Full backend events remain in their existing transcript.

## Decisions

### Walk the existing usage object, rather than select counter names

Replace the named lookup in the existing shared `counters` helper with traversal of the supplied native usage/token object. Preserve numerical leaves under their native keys. Join nested object keys with dots, matching the existing OpenCode `cache.read` and `cache.write` representation; use numeric path segments for array entries such as `iterations.0.input_tokens`. Missing, null and nonnumeric leaves supply no numerical counter. Numerical values still pass through the existing usage-file validation, which rejects negative or nonfinite consumption rather than accepting malformed usage.

Keep traversal confined to the selected usage/token object. Do not collect every number in a result event: schema values, event indexes and output limits are not consumption. Do not replace missing fields with zero or construct a total from input/output/cache fields. Overlapping fields retain distinct paths and are printed and summed separately, just as existing input and cached-input counts already overlap for Codex. A counter total is not the sum of all map entries.

Alternative: extend each allowlist for today's fixtures. That still drops the next counter the backend emits and fails the user's request for all available usage. A new raw-usage/provenance record duplicates the existing transcript and requires another format and reporting path.

### Retain backend-specific accounting boundaries and cost mappings

| Adapter | Consumption source and accounting | USD source |
| --- | --- | --- |
| Claude Code | Last `result.usage` | Last `result.total_cost_usd` |
| Codex | Last `turn.completed.usage` | No USD cost in the recorded exec output |
| Antigravity | Last result event's `result.usage` | No USD cost in the recorded output |
| OpenCode | Each `step_finish.part.tokens`, summed by native path | Sum explicitly reported `step_finish.part.cost` |

Claude's separate `modelUsage` block remains in the transcript. The selected consumption source is `result.usage`; `modelUsage` additionally mixes per-model details with context/output limits, which must not enter role spending totals. This preserves the existing summary boundary without asserting that the single-model recording establishes every multi-model or subagent accounting detail.

Remove every call site's list of counter names. Keep the known native cost mappings and preserve their explicit zero values. Do not assume a field is USD based solely on a name, map credits to dollars or read account cost. If a backend adds a documented USD value to its normal output, its adapter can map that value to `costUsd` without changing the universal counter/reporting policy. This proposal does not claim an unobserved cost field exists for Codex or Antigravity.

Do not sum final cumulative summaries across repeated result events. Continue to sum OpenCode's independent model-step records. Continue writing usage before judging the harness exit, so a failing worker retains its reported usage. `runHarness` remains synchronous in its extraction callback; collection requires no additional wait.

Alternative: unify all streams as additive events. That double-counts summary-reporting backends. Taking only the last event universally loses earlier OpenCode model steps.

### Reuse the worker format and existing reports

Keep `{ tokens?: Record<string, number>, costUsd?: number }`. The legacy `tokens` field carries the native numerical consumption counters, including request counts; clarify this in the contract and README rather than adding a duplicate `metrics` field. Custom workers already use the same path. Keep step reporting, per-role summation by name and missing-usage/missing-cost counts; change code there only if focused tests expose a gap. No new persisted state or usage marker is needed.

Update the README's backend table to list examples rather than imply exhaustive lists. Document native counter semantics, nested and array paths, explicit zero versus unavailable cost, and the fact that the backend's reported cost may be list-price usage rather than the subscriber's bill.

Alternative: canonicalize names into common input/output/cache counters. Claude's input excludes cache reads while Codex's includes them, so name-only conversion misrepresents consumption.

## Risks / Trade-offs

- More counters make end lines longer: this is the requested completeness; keep the existing compact `name=value` presentation.
- Native summaries contain overlapping totals and breakdowns: keep each native path separate and never invent a grand total across map entries. Array-index totals are totals for that reported position, not a reconstructed cross-step iteration ledger.
- Different backends attach different semantics to similar names: retain native names and existing per-role reporting; do not claim provider-comparable normalized tokens.
- Backends may omit cost or stop before reporting usage: preserve unavailable values and the worker's existing exit behavior; no secondary collection.

## Migration Plan

Ship the extraction change, fixture expectations and README clarification together. Old usage files remain valid; new counters fit the existing map. No backfill or external consumer schema change is required. Rollback restores the counter allowlists without changing stored usage or run state.

## Cut Pass

Each retained item names its authority and the concrete failure of its simpler alternative. Existing mechanisms are reused, not added again.

| Item retained | Contract clause or explicit request | Simpler alternative and concrete failure |
| --- | --- | --- |
| Shared collection of every numeric leaf | Shipped adapters; user requests all available usage | Extending fixed lists still drops the next reported counter. |
| Native dotted object paths | Worker interface; Shipped adapters | Keeping only top-level numbers drops Claude's nested thinking, cache and tool request counts. |
| Native array-index paths | Shipped adapters | Skipping arrays drops Claude's reported per-iteration consumption; summing the array into top-level fields double-counts its summary. |
| Null-prototype maps for collection and OpenCode sums | Worker interface; Shipped adapters | Plain object maps mistake native names such as `__proto__` or `constructor` for inherited properties and lose or corrupt counters. |
| Collection confined to usage/token objects | Shipped adapters | Traversing a whole event turns unrelated indexes, schema numbers and limits into spending. |
| Existing final-summary selection for Claude | Shipped adapters | Adding cumulative result summaries counts the same consumption repeatedly. |
| Existing final-summary selection for Codex | Shipped adapters | Adding completed-turn summaries changes the existing accounting boundary and can repeat cumulative consumption. |
| Existing final-summary selection for Antigravity | Shipped adapters | Adding repeated result summaries counts the same consumption repeatedly. |
| Existing per-step summation for OpenCode | Shipped adapters | Taking its last model step omits earlier model usage. |
| Existing native USD mappings | Shipped adapters; user requests available cost | Ignoring reported cost loses Claude/OpenCode's amounts; guessing a mapping invents unsupported cost. |
| Existing `tokens` field | Worker interface | A new parallel counter field duplicates accepted storage and forces external parsers to change. |
| Existing `costUsd` field | Worker interface | A new amount field duplicates existing validation, formatting and totals. |
| Existing finite non-negative numerical validation | Worker interface | Accepting malformed quantities can print invalid spending; no new validator is needed. |
| Existing write-usage-before-exit behavior | Shipped adapters | Judging exit first loses usage emitted by a failing backend. |
| Existing step formatting for arbitrary names | Progress and usage reporting | Showing only known names hides the additional reported counters. |
| Existing per-role summation by individual name | Progress and usage reporting | A sum across all counters double-counts reported totals and their breakdowns. |
| Existing zero/unavailable and missing-step counts | Progress and usage reporting | Replacing an absent cost with zero falsely claims reported spending. |
| Existing transcript for metadata and full events | Progress and usage reporting; user's no-extra-machinery direction | A new raw-data record duplicates retained evidence and adds another reporting path. |
| README examples and semantic clarification | User's universal reporting request, docs | Leaving the fixed field table implies new counters are unsupported and that overlapping counters are comparable. |
| Task 1.1: extraction, fixtures and local docs | Shipped adapters | Reporting-only changes cannot restore counters discarded by adapters. |
| Task 1.2: stream/accounting/failure cases | Shipped adapters | A single final recording cannot establish repeated-summary accounting or preserved failures. |
| Task 2.1: existing report/custom-worker coverage and examples | Worker interface; Progress and usage reporting | Adapter tests alone do not establish the end-to-end reports or cumulative totals. |
| Task 2.2: complete package and spec checks | Repository `npm test` rule; contract is source of truth | Focused fixtures alone miss regressions and invalid contract deltas. |
| Recorded-output expectations extended in place | Shipped adapters | Keeping the old expected counter subset would allow newly reported fields to be discarded. |
| Four additional-field/nested/array adapter cases | Shipped adapters | A checked-in recording alone cannot establish support for a previously unknown field or safe native property names. |
| Three repeated-summary adapter cases | Shipped adapters | Single summary fixtures cannot reveal accidental addition of cumulative usage. |
| Existing OpenCode sum case extended with additional paths | Shipped adapters | Summing only the old recognized fields loses new counters from earlier model steps. |
| Existing stub log changed to append and count invocations | Shipped adapters; explicit task 1.2 | An overwritten log cannot show an extra cost-collection invocation; no new test harness is needed. |
| Two worker malformed-number cases | Worker interface | Existing invalid-JSON/unknown-key tests do not establish rejection of newly collected negative or nonfinite counters. |
| Existing resume totals case extended in place | Progress and usage reporting | Checking only old names cannot establish dotted/array paths, overlapping totals, explicit zero cost and empty usage together. |
| `.openspec.yaml` schema record | Explicit OpenSpec proposal workflow | Unregistered planning files omit the native change metadata. |
| `proposal.md` record | Explicit OpenSpec proposal workflow | A checklist alone omits the replacement scope and reason. |
| Spec delta record | Contract is source of truth | Adapter-only instructions leave the expanded consumption policy outside the contract. |
| `design.md` record | Explicit OpenSpec proposal workflow | Tasks alone leave counter paths and cumulative-versus-additive accounting undecided. |
| `tasks.md` record | Explicit OpenSpec proposal workflow | Prose alone lacks the required apply checklist. |

Removed with the superseded proposal: Codex app-server lookup, initialization/experimental opt-in, RPC/request/thread matching, helper deadline and shutdown lifecycle, lookup-specific resume exclusion, asynchronous usage callback, lookup diagnostics, microdollar conversion, `costEstimated` and estimate-specific aggregation/labels, and live lookup tasks. These served native estimate retrieval, which the user replaced with direct reporting. Also cut ccusage, a price table, new metrics/raw/provenance fields, persisted usage state, normalization and a new reporting layer: the existing invocation, counter map, cost field, transcripts and reports already serve the requested behavior.

Implementation cut pass: removed all four counter allowlists and reused the existing controller and worker validation without behavioral changes. Extended existing argument/failure/step-sum/resume tests rather than duplicating that coverage. Kept only the new-field, native-path, cumulative-summary and malformed-number cases that exercise this change. No per-step numerical-validity check was added to OpenCode: its existing aggregate validation remains the boundary.
