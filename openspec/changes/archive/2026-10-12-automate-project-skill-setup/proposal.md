# Proposal

## Why

The npm package includes `openspec-loop` and `openspec-scope`, but project setup requires manually copying their directories and repeating the copy after upgrades. Labeler demonstrates the resulting drift: the installed 0.4.0 package includes the scoping skill, while its project skill directories still expose only the supervision skill.

## What Changes

- Add `loop setup`, one project-local command for installing and refreshing every skill bundled with the executing package.
- Install the skills into `.agents/skills/` for Codex and `.claude/skills/` for Claude Code in the invoking Git checkout.
- Refresh existing bundled skill directories and add missing ones while preserving unrelated skills and project configuration.
- Replace the README's manual copy procedure with the command for both initial setup and refresh after package upgrades.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: Add project skill setup to the command contract, alongside the existing supervision and scoping skills.

## Impact

- `src/cli.ts`: Parse and dispatch the setup command without run preparation.
- A small setup module: Locate bundled skills relative to the executing package and install them in the checkout identified by the existing Git root helper.
- CLI/filesystem tests and a relocated-package check: Verify installation, refresh, preservation and source resolution.
- `README.md`: Document the command, refresh behavior and package-owned skill directories.
- No new runtime dependency or loop configuration field. Package installation continues to write only the package itself; project setup remains explicit.
