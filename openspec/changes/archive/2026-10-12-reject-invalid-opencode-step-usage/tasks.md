# Tasks

## 1. Preserve invalid OpenCode step usage

- [x] 1.1 Add independent adapter regressions in `test/adapters.test.ts` for top-level `tool_requests`, nested `details.tool_requests`, and USD cost with distinct step IDs in both `[-1, 5]` and `[5, -1]` orders; verify each retains its negative field and the existing `readUsage()` rejects the written file, and demonstrate these regressions fail against the original reducer.
- [x] 1.2 Update only the final reducer in `src/adapters/opencode.ts` to preserve an invalid operand for each counter and numeric reported cost; add an invalid-to-valid same-ID snapshot regression, and verify it and all cancellation cases pass alongside the existing valid multi-step, native-path, absent-usage and server-cleanup adapter tests after building and running `node --test dist/test/adapters.test.js`.

## 2. Verify the integrated change

- [x] 2.1 Run `npm test` and `openspec validate reject-invalid-opencode-step-usage --strict`; verify both pass and review the implementation diff to confirm it changes only the OpenCode reducer and its adapter regressions, adds no configuration or usage fields, and preserves shared helpers and worker validation.
