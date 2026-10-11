# Proposal

## Why

A change proposed in a fresh issue worktree loses the ignored `openspec/loop.local.yaml` kept in the main checkout. The loop then silently runs with different agents, checks or delivery settings, so the repository's supported worktree workflow changes how a run behaves.

## What Changes

- Read the main checkout's `openspec/loop.local.yaml` as shared local overrides for the clone, without moving or copying it.
- Combine the invoking checkout's committed configuration, the shared overrides, and any distinct invoking-worktree overrides, in that order.
- Reread the applicable files on every run, resume and step; report malformed or unreadable files at their actual paths.
- Resolve the main checkout through Git, independently of the branch checked out there. Make an unresolvable main checkout explicit rather than silently dropping its overrides.
- Document the precedence and update supervision diagnosis to read the configuration that actually supplied the failing agent.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: Amend Loop configuration to inherit shared local overrides across worktrees while retaining invoking-worktree overrides and existing merge and path rules.

## Impact

`src/config.ts`, Git path discovery in `src/git.ts`, configuration and command regression tests, `README.md`, and the shipped `skills/openspec-loop/SKILL.md`. No dependencies, CLI options or run-state fields are added. Committed settings still come from the invoking checkout; the main checkout's committed file is not substituted. Existing linked worktrees will begin inheriting main-checkout local values they do not explicitly override.
