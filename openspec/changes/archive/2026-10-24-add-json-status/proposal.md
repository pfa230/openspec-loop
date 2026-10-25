# Proposal

## Why

Operum wants to run a committed change through openspec-loop while retaining ownership of user interaction and delivery. The existing CLI and `delivery: local` cover execution and branch handoff, but a host currently has to parse human status text to distinguish outcomes.

Source: [#125](https://github.com/pfa230/openspec-loop/issues/125). This proposal addresses the minimum integration agreed in discussion, not the issue's full feature list.

## What Changes

- Add `loop status <change> --json`, returning a versioned object with `status`, `branch`, `worktree`, and the existing human-readable `report`.
- Document how a host combines the query with existing run controls, local delivery, and committed plan edits for decision recovery in `docs/operations.md`.
- Extend existing CLI and status coverage to verify the JSON contract and retained text/error output.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: expose the existing status observation as a supported JSON response.

## Impact

Changes are limited to argument handling in `src/cli.ts`, status output in `src/commands.ts`, existing status-related tests, and `docs/operations.md`. There are no new dependencies or persisted run fields.

The host continues to use `run`, `stop`, and `resume`; reads the completed branch's SHA with Git; and owns publication, CI, QA, and merging. Event streams, RPC or library APIs, new delivery modes, answer/cancel commands, MCP injection, custom credential mounts, Windows support, dependent queues, and structured usage/findings are outside this proposal.
