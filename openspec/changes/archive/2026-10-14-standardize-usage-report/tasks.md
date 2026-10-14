# Tasks

## 1. Standard usage totals

- [x] 1.1 Change the usage file to `{ inputTokens?, outputTokens?, costUsd? }` in `src/step.ts`, rejecting any other key, and change `usageText` and `usageTotals` in `src/controller.ts` to the standard form (`input 332,936, output 2,234, cost $0.57`, each value `unavailable` when absent, `usage unavailable` when all are). Update the existing worker, controller, stepping and implementation tests in place; cover a leftover `tokens` map as malformed usage and a role total that rounds summed cost to cents.
- [x] 1.2 Replace `counters` in `src/adapters/common.ts` with the per-adapter totals from the design table, where an invalid component yields an invalid total, and update all four adapters. Update `test/adapters.test.ts` so each recording's expected usage file holds the mapped totals and cost, and the existing invalid-quantity and OpenCode cancellation cases expect invalid `inputTokens`, `outputTokens` or `costUsd`.
- [x] 1.3 Update the README: the adapter usage table becomes the mapping to input and output, the custom-worker usage format names the three fields, the progress and "Usage by role" examples use the standard form, and the raw counters are said to stay in the step's transcript.
- [x] 1.4 Run `npm test` and `openspec validate standardize-usage-report --strict`; both pass.
