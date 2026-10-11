# Proposal

## Why

Issue [#43](https://github.com/pfa230/openspec-loop/issues/43) needs a supported way to inspect an approved plan or reviewed implementation before later stages run. Today `loop run` and `loop resume` continue until completion or a stop, so returning control between stages requires timing an interruption.

## What Changes

- Add `loop step <change>`: enroll a new run or continue an existing one, using the same prerequisites, locking, controller and recovery rules as ordinary advancement.
- Return after the controller completes one pending stage, including its normal review/revision cycle and minor fixes; retain existing handoffs when a stage cannot complete as written.
- Report a successful boundary separately from a stopped or completed run, name the next pending stage and continuation commands, and include existing locations and cumulative usage.
- Let subsequent `step` calls continue one stage at a time and ordinary `resume` continue through the remaining stages without repeating completed work. Ordinary `run` keeps its existing refusal for an enrolled change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: add stage-bounded advancement and reporting, reconcile automatic progression with the explicit step boundary, and extend existing enrollment and prerequisite requirements to `step`.

## Impact

The CLI and command dispatch (`src/cli.ts`, `src/commands.ts`), the shared controller and status reporting (`src/controller.ts`, `src/commands.ts`), existing command/controller test fixtures, README command documentation and the shipped supervision skill. No new dependency, configuration key, persisted field or transcript format is needed.

Scope is stage boundaries only. Role fixtures, arbitrary replay, benchmarking infrastructure and reopening implementation after a manual plan edit are excluded; `resume --implement` already owns the last case.
