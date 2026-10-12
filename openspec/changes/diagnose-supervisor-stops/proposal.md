# Proposal

## Why

The supervisor described an adapter's rejection of a successful OpenCode turn mainly as an implementer exit status and asked about recovery before establishing the causal chain. Issue #55 requires the supervisor to explain the failed operation, the supporting evidence and the work left behind without the user having to demand a deeper investigation.

Source issue: https://github.com/pfa230/openspec-loop/issues/55

## What Changes

- Strengthen the existing supervision skill's execution-failure diagnosis: identify the failed operation and distinguish a harness exit from an adapter's rejection of its reply before proposing recovery.
- Permit targeted read-only inspection of the invoked adapter and its relevant helper when the transcript and configured command cannot establish that distinction.
- Describe committed and uncommitted work, validation completed and still pending, and remaining uncertainty from the run's existing files and Git history.
- Preserve unchanged report relay and the requirement to wait for the user's agreement before repairs or continuation.
- Add a reusable supervision regression scenario for a successful child whose prose-plus-JSON final reply is rejected by its wrapper; exercise the shipped skill in both Claude and Codex and record observed behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: Strengthen the Supervision skill requirement with causal diagnosis, targeted adapter inspection and evidence about remaining work before recovery is proposed.

## Impact

Implementation is limited to `skills/openspec-loop/SKILL.md`, its README supervision guidance and a regression scenario under `test/recordings/`. This change does not alter the controller, adapters, reply validation, report format, configuration, persisted state or dependencies. The adapter/output-contract repair remains separate in #54; this change needs no dependency on that repair.
