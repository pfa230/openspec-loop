# Proposal

## Why

The loop's bundled skills currently use `openspec-*` names even though the loop owns them. The user wants a consistent `loop-*` namespace and a proposing wrapper that explains the resulting design and changes while continuing to use native OpenSpec planning.

## What Changes

- **BREAKING** Rename the bundled supervision skill from `openspec-loop` to `loop-run` and the scoping skill from `openspec-scope` to `loop-scope`.
- Add `loop-propose`, delegating to the project's installed native proposing workflow and finishing with a concise, artifact-grounded design and change summary before the artifact inventory.
- Have `loop-scope` draft through `loop-propose`, retaining its attended review and commit workflow.
- Upgrade projects through `loop setup`: install the three `loop-*` skills and remove the two retired package-owned skill directories in both tool locations. Preserve native OpenSpec skills and commands.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: bundled skill names, proposing delegation and summary, scoping integration, and setup migration from the old names.

## Impact

- `skills/`, the checked-in `.agents/skills/` and `.claude/skills/` bundled copies, `src/setup.ts`, `test/setup.test.ts`, and README skill invocations and upgrade guidance.
- Existing projects receive the renamed skills and new wrapper by upgrading openspec-loop, rerunning `loop setup`, and committing the resulting files.

No OpenSpec source/package patches, generated native workflow edits, repository-specific summary rule, compatibility aliases or new shell subcommand are needed.
