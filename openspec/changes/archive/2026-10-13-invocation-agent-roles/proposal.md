# Proposal

## Why

Choosing agents for a run means editing the run worktree's `openspec/loop.local.yaml`, which people do not do. The loop should accept the four role agents on the command instead, for example `loop run add-thing claude codex muse deepseek`.

## What Changes

- `loop run`, `loop step` and `loop resume` accept four optional agent aliases after the change name, in role order: proposal reviewer, plan reviser, implementer, implementation reviewer.
- The loop writes them as the `roles` entries of `openspec/loop.local.yaml` in the run's worktree, keeping the file's other content, and the command runs with them. Later commands read them from that file like any hand-written override.
- Each alias must be an agent the configuration defines. An unresolvable alias, or any count other than zero or four, refuses before anything changes.
- The supervision skill passes agents the user names, and the README documents the form.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: Run-control commands can set the run worktree's local role assignment.

## Impact

- `src/cli.ts`: Parse the four aliases and update the usage text.
- `src/commands.ts`, `src/config.ts`: Apply the aliases over the configured roles before resolving agents, and write them to the run worktree's local file.
- Tests for parsing, refusal, the written file and later commands.
- `skills/openspec-loop/SKILL.md` and `README.md`: Document the form.
- No new configuration field, state field, adapter or dependency.
