# Tasks

## 1. Usage format and reporting

- [ ] 1.1 Extend `Usage` and strict usage-file validation in `src/step.ts` with optional `costEstimated: true`, requiring a valid `costUsd`; add cases in `test/worker.test.ts` or the existing state tests for marked, unmarked and invalid marker records. Verify old usage remains accepted and marker-only records are rejected through `npm test`.
- [ ] 1.2 Update step output and role totals in `src/controller.ts` to label estimated cost when any contributing cost is marked, preserving token totals and missing-cost counts; add worker/controller or integration cases covering mixed costs across resume and stage boundaries. Document the additive usage field and total-label meaning beside the worker interface/report examples in README; verify exact output and compatibility through `npm test`.

## 2. Codex thread lookup

- [ ] 2.1 Allow `runHarness` in `src/adapters/common.ts` to await an asynchronous usage callback before writing usage and judging exit, keeping synchronous adapters compatible. Verify existing adapter cases and a rejected optional Codex lookup retain reported tokens and original nonzero exec status through `npm test`.
- [ ] 2.2 Implement the Codex-only stdio lookup in `src/adapters/codex.ts` with the design's handshake, exact thread/request attribution, five-second deadline and helper cleanup; accept safe non-negative USD micros, convert by 1,000,000 and mark estimates. Extend the Codex stub in `test/adapters.test.ts` to distinguish exec from app-server and record both invocation paths. Verify matching estimates, explicit zero, mismatched threads, null/credit-only/invalid responses, missing ID, unsupported/authentication/error responses, resumed threads, failed exec and a stalled helper through `npm test`; keep reply/schema arguments and token counters unchanged in these cases.
- [ ] 2.3 Correct the adapter comment and README cost table with conditional estimate availability and authentication requirements. Repeat the read-only lookup for an actual completed benchmark exec thread under its authentication, without issuing inference solely for lookup, and record CLI version, requested/returned thread attribution, USD conversion when present, or the specific observed API/authentication/data limitation. Verify the documented availability claim matches that result; a null response must remain unavailable, not zero.

## 3. Integration verification

- [ ] 3.1 Run `npm test` for the complete change and `openspec validate collect-codex-thread-cost --strict`; verify all tests and delta validation pass, all modified requirement scenarios remain present, and only the planned adapter/usage/report/docs surfaces changed.
