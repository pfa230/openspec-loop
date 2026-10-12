# Proposal

## Why

The shipped adapters discard usage counters that their backends already emit because each adapter selects a fixed list of names. The user's replacement direction for [#51](https://github.com/pfa230/openspec-loop/issues/51) is to report all available usage across every backend, using the existing worker output rather than introducing cost collection machinery.

## What Changes

- Collect every numeric consumption counter in the backend's reported usage/token object, including input, output, cached, cache creation, reasoning/thinking, total tokens and tool request counts, without a fixed counter allowlist.
- Preserve native names and nested paths in the existing usage-file counter map; show and total each reported counter independently in the existing step and role reports.
- Keep collecting explicitly reported USD cost through the existing `costUsd` field. Missing counters and cost remain unavailable; explicit zero stays zero. Never calculate cost from tokens or retrieve it through another process or API.
- Apply the same policy to Claude Code, Codex, Antigravity, OpenCode and custom workers using the existing worker interface. Retain each backend's existing final-summary or per-step accounting boundary.
- Replace the unimplemented `collect-codex-thread-cost` proposal. Its app-server lookup, deadline, subprocess lifecycle and estimated-cost marker are unnecessary for this direction.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: Require complete reported consumption counters from all shipped adapters and preserve them through the existing worker interface and usage reports, without additional collection or estimation.

## Impact

Changes are scoped to `src/adapters/common.ts`, all four shipped adapters, their tests, reporting/worker coverage and the README. The existing `{ tokens?, costUsd? }` usage format remains compatible; `tokens` continues to carry native named counters and may also contain reported request counts. No dependency, configuration, inference run, auxiliary process, API request, pricing table, usage state, cost provenance field or separate reporting framework is added. Nonnumeric backend metadata and unrelated event fields remain in the existing transcript, rather than being treated as summable consumption.
