# Proposal

## Why

The OpenCode adapter leaves a potentially hour-long prompt subject to Node's implicit HTTP timeouts and discards the underlying error when a request fails. The reported 302-second interruption fits this machine's 300-second transport defaults, but retaining only `fetch failed` prevents establishing its exact cause.

## What Changes

- Explicitly disable HTTP response-header and response-body inactivity timeouts for the adapter's local OpenCode requests, including the event subscription; worker interruption and genuine failures still end the turn.
- Keep failed-operation context, error names and codes, cause chains and available stacks in the existing worker transcript before cleanup.
- Add regressions for delayed responses, quiet streams, transport failures and interruption, and document the timeout and diagnostic behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: Specify OpenCode transport lifetime and failure diagnostics within the existing worker and owned-harness contract.

## Impact

- `src/adapters/opencode.ts`: explicit HTTP client settings and contextual error reporting.
- `package.json` and `package-lock.json`: a direct Undici dependency compatible with the package's supported Node versions, providing a public configurable HTTP dispatcher.
- `test/helpers.ts` and `test/adapters.test.ts`: extend the existing HTTP/SSE fixture and adapter regressions.
- `README.md`: document unbounded response waits and the retained diagnostic evidence.
- Existing CLI arguments, worker files and controller reporting remain sufficient; no persistent configuration or run-state migration is required.
