# Proposal

## Why

Installing openspec-loop supplies its adapters, but a running `loop` rediscovers them through the caller's PATH as though they were separately installed tools. A restricted worktree shell can therefore make the package unable to run its own installed commands, including an adapter nested under `loop-jail`.

## What Changes

- Resolve the four bundled adapters and `loop-jail` from the executing package, independently of PATH, the current checkout and npm's current global prefix.
- Apply the same ownership rule to the command wrapped by `loop-jail`, retaining the adapter's harness identity and executable maps.
- **BREAKING**: Bare bundled command names select the executing package's implementation even when PATH contains another implementation. An explicit path selects a custom or different installation's command.
- Preserve PATH lookup for other commands and checkout-relative resolution for explicit relative paths. Document the boundary between bundled commands and separately installed prerequisites.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: Define package-owned worker command resolution for direct and jailed invocation.

## Impact

`src/config.ts`, `src/jail.ts`, a small shared package-command resolver, their existing tests and README command-resolution guidance. Reuse the package's existing `bin` manifest and executable-mapping machinery; add no dependencies or configuration. OpenSpec, harness CLIs, Git, Bash, optional ai-jail, authentication and project setup remain prerequisites. This change does not install or discover external prerequisites outside PATH and does not make the top-level `loop` discoverable in a shell that cannot find it.
