# Proposal

## Why

OpenCode currently sums distinct model-step usage before the worker validates it, so a negative count or USD cost can be cancelled by a positive value and accepted as ordinary consumption. [Issue #61](https://github.com/pfa230/openspec-loop/issues/61) demonstrates `tool_requests: -1` and `5` becoming an apparently valid `4`; the existing invalid-quantity scenario only covers invalid values that survive collection.

## What Changes

- Require invalid numeric quantities in selected OpenCode model-step reports to remain invalid through aggregation, regardless of step order, so existing worker validation rejects them.
- Preserve ordinary valid sums, native nested counter paths, and the latest-report-per-step accounting boundary.
- Add adapter regressions for negative top-level counts, nested counts and reported cost in both orders, exercising the existing worker usage reader.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: Clarify the shipped-adapter requirement so per-step aggregation cannot hide negative or nonfinite quantities before malformed-usage validation.

## Impact

The implementation is limited to the final usage reducer in `src/adapters/opencode.ts` and regression coverage in `test/adapters.test.ts`. The existing usage-file format, `counters()`/`usage()` helpers and `src/step.ts` validation remain applicable; no dependencies or configuration are added.

## Non-goals

Changes to other adapters, role-level reporting, event subscription, session ownership, or worker validation are outside this fix. Updating the separate openspec-loop-bench case's gold commit and hidden acceptance checks is downstream work in that repository after the upstream fix is available.
