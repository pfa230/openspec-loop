# Tasks

## 1. Complete reported usage across adapters

- [x] 1.1 Replace the fixed-name `counters` extraction in `src/adapters/common.ts` with native-path collection of numeric leaves in nested usage objects and arrays; update all four adapters to use it, retaining final-summary versus OpenCode per-step accounting and existing explicit USD cost mappings. Update adapter comments and README's usage table/worker-format explanation in the same change. Verify through `test/adapters.test.ts` that the checked-in recordings retain previously dropped total, thinking, cache, tool request and per-iteration counters, and document the exact new usage objects rather than an exhaustive field allowlist.
- [x] 1.2 Extend existing adapter fixtures/cases to exercise an additional counter for every shipped backend, nested and array counters, nonnumeric metadata, zero versus absent values, repeated cumulative summaries, OpenCode's additive steps and usage before a nonzero exit. Verify exact usage-file contents, preserved harness arguments and exit status, existing malformed-number rejection, and exactly one invocation of the backend with no auxiliary command; run these checks through `npm test`.

## 2. Existing reporting path and integration

- [x] 2.1 Add focused worker/controller integration coverage showing additional native counter paths in step end lines and cumulative role reports across attempts/resumes or stage boundaries; cover custom workers, cost-only/usage-only/empty usage, explicit zero and missing-cost counts. Retain existing strict `{ tokens?, costUsd? }` validation and aggregation, modifying them only if these tests expose a gap. Update README reporting examples alongside this coverage and verify totals are by individual name, without inventing a sum across overlapping breakdowns.
- [x] 2.2 Run `npm test` and `openspec validate report-backend-usage --strict`; verify complete test and delta-validation success, preserved existing scenarios, no changes to the worker inference/reply path, and no added dependency, auxiliary process/API request, pricing calculation, configuration, usage field or persisted state.
