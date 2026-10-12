# Proposal

## Why

The supervisor described an adapter's rejection of a successful OpenCode turn mainly as an implementer exit status and asked about recovery before establishing the causal chain. Issue #55 requires the supervisor to explain the failed operation, the supporting evidence and the work left behind without the user having to demand a deeper investigation.

Source issue: https://github.com/pfa230/openspec-loop/issues/55

## What Changes

- Strengthen the existing supervision skill's execution-failure diagnosis: identify the failed operation and distinguish a harness exit from an adapter's rejection of its reply before proposing recovery.
- Permit targeted read-only inspection of the invoked adapter and its relevant helper when the transcript and configured command cannot establish that distinction.
- For execution failures, describe committed and uncommitted work, validation completed and still pending, and remaining uncertainty from the run's existing files and Git history.
- Preserve unchanged report relay and the requirement to wait for the user's agreement before repairs or continuation.
- Exercise a successful child's rejected prose-plus-JSON reply in both Claude and Codex supervision sessions, using the pinned real adapter/helper pair. Record reproducible setup and observed behavior in one evidence comment on #55.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: Strengthen the Supervision skill requirement with causal diagnosis, targeted adapter inspection and evidence about remaining work before recovery is proposed.

## Impact

Repository implementation is limited to `skills/openspec-loop/SKILL.md` and its existing README supervision guidance. Rehearsal setup and results live on #55; disposable fixture files and session captures remain outside the repository. This change does not alter the controller, adapters, reply validation, report format, configuration, persisted state or dependencies. The adapter/output-contract repair remains separate in #54; this change needs no dependency on that repair.
