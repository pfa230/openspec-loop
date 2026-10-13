# Design

## Context

See `proposal.md` for motivation and the `loop-workflow` delta for the contract. The OpenCode event collector stores the latest root-session `step-finish` part in a map keyed by part ID. After server cleanup, its final reducer flattens `part.tokens` using `counters()` and unconditionally adds each numeric leaf and reported numeric cost. `usage()` writes the existing optional `tokens` and `costUsd` fields. The worker's `readUsage()` already rejects quantities unless they are finite and non-negative.

`test/adapters.test.ts` already has an API/server stub, `nativeEvent()` and `eventFile()` helpers, and a regression that sums distinct root steps while replacing repeated snapshots and ignoring child-session usage. These provide the fixture and compatibility coverage without a new harness.

## Goals / Non-Goals

**Goals:** Make invalidity survive distinct-step reduction while keeping the existing worker reader responsible for malformed-usage failure.

**Non-Goals:** Do not validate or retain every intermediate event, broaden session selection, or change the shared usage helpers, worker format, exit handling or reporting pipeline.

## Decisions

### Preserve an invalid operand in the existing accumulator

Use a small adapter-local addition operation for both counters and reported numeric USD cost. If the current accumulator is invalid, keep it. Otherwise, if the next quantity is invalid, retain that quantity. Otherwise, add the quantities, treating an absent accumulator as zero only when a quantity is actually reported. Invalid means negative or nonfinite. A nonfinite sum of valid inputs also remains invalid on subsequent additions.

This needs no separate invalid flag or new usage field: the existing counter entry or cost carries the invalid value. Preserve other collected counter paths and reported costs as usual. Keep `counters()`'s native path collection, the null-prototype token map, and `usage()`'s treatment of omitted fields. Negative values serialize unchanged; nonfinite numbers serialize as `null`, which the existing reader rejects. Do not coerce invalid values to zero, clamp them, drop them or emit a valid net sum.

Plain addition is smaller but permits the issue's cancellation. Adapter-side failure would also prevent acceptance, but adds a failure decision to final cleanup and risks disturbing existing harness exit precedence; preserving invalidity uses the existing validation path. Moving this operation into a shared helper would expose other adapters to an operation they do not need.

### Apply the rule only to selected latest reports

Keep event collection unchanged. Reduction examines the map's latest report for each distinct root-session step. A valid final update replaces an earlier negative snapshot of the same step; an invalid final update must survive addition with every other step. Checking every incoming event would change the established latest-snapshot accounting boundary.

### Test each invalid dimension independently through the adapter and worker reader

Extend the existing adapter tests with distinct root steps and a successful native reply. Cover top-level `tool_requests`, nested `details.tool_requests`, and reported cost separately, each in orders `[-1, 5]` and `[5, -1]`. Other reported quantities must be valid so one invalid field cannot mask a dropped field in another dimension. Assert the affected usage field remains negative, then call the existing `readUsage()` on the adapter-written file and assert its malformed-format problem. The adapter can still exit 0 with its valid reply; worker validation rejects the usage.

Retain the existing valid multi-step/snapshot regression. Add a focused case replacing an invalid earlier report of one ID with a valid final report, then summing with a distinct valid step; check counters and cost remain valid. A case containing only an isolated negative leaf does not exercise cancellation, and a full controller fixture would duplicate the existing malformed-usage worker coverage.

## Risks / Trade-offs

- Retaining an invalid operand means that field no longer represents an ordinary total. Mitigation: the worker rejects the whole file instead of reporting it as accepted usage; the transcript retains the original events.
- A guard applied during event collection would reject superseded snapshots. Mitigation: apply it only in final reduction and cover invalid-to-valid replacement.
- A guard applied only to incoming values could allow a later addition to hide earlier invalidity. Mitigation: check both operands and test both step orders for each field independently.

## Migration Plan

No data or configuration migration is needed. Ship the reducer fix and regressions together; rollback reverts those code and test changes. Existing usage files remain compatible.
