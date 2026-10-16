# Proposal

## Why

A shell can launch `loop` by path while omitting its installation's bin directory from PATH. The adapters are installed beside `loop`, but ordinary executable lookup then cannot find them.

## What Changes

- Append the directory used to launch `loop` to its inherited PATH before preparing a run.
- Let existing role lookup, workers and wrappers use that PATH with their current command names and lookup order.
- Document that this makes sibling installed commands available; external prerequisites still need installation and authentication.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: Include the CLI's launch directory in the execution environment.

## Impact

CLI startup in `src/cli.ts`, focused CLI regression tests and README lookup guidance. No package resolver, manifest lookup, adapter changes, sandbox changes, configuration migration or new dependencies.
