# Proposal

## Why

`loop-codex` records exec token usage but never collects Codex's separately reported thread-cost estimate, leaving mixed-harness benchmark costs incomplete. Issue [#51](https://github.com/pfa230/openspec-loop/issues/51) asks to reuse that estimate when available without compromising worker results when it is unavailable.

## What Changes

- After an exec invocation, request usage for the exact `thread.started.thread_id` through Codex's existing app-server API; retain token usage and worker exit behavior when no usable estimate is returned.
- Store an available USD estimate in the existing `costUsd` flow, convert USD micros to dollars, and mark it as estimated in machine-readable usage, step output and role totals.
- Narrow the contract's prohibition on estimation/conversion to allow a harness-provided estimate and denomination conversion, without computing prices in the loop.
- Correct documentation that says Codex reports no cost, and document observed API/authentication limitations. Availability is conditional: a planning-time read of a real benchmark exec thread returned `threadUsage: null`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: Extend shipped adapters, the worker usage interface and progress reporting to collect and identify a harness-provided estimate while preserving unavailable values and worker results.

## Impact

Affected areas are `src/adapters/codex.ts`, the small shared harness runner in `src/adapters/common.ts`, usage validation in `src/step.ts`, formatting and aggregation in `src/controller.ts`, adapter/worker/report tests, and the README. The optional usage marker is additive; existing usage files remain valid and `costUsd` retains its meaning and units. The lookup uses the installed Codex CLI and its existing authentication, with no new dependency, credential setup, pricing table, inference invocation, CLI option or general reporting framework.
