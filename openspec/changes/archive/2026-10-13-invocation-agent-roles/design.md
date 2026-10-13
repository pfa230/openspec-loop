# Design

## Context

See `proposal.md` for the motivation. `src/cli.ts` accepts only the change name for `run` and `step`, and `--attempts`/`--implement` for `resume`. `prepare` in `src/commands.ts` reads the merged configuration and resolves the roles before taking the run's lock; enrollment creates the run's worktree afterwards. Configuration is read from the invoking checkout and the main checkout, so the run worktree's local file applies to commands invoked from that worktree.

## Goals / Non-Goals

**Goals:** Set the four role agents from the command, with the same effect as editing the run worktree's local file.

**Non-Goals:** Defining agents on the command line, assigning fewer than four roles, harness-name shortcuts and new adapters.

## Decisions

### Four positional aliases in role order

The aliases follow the change name: `loop run <change> <proposalReviewer> <planReviser> <implementer> <implementationReviewer>`. For `resume`, the existing options follow the aliases. Any other count is malformed syntax: usage and exit 2.

### Resolve first, write the file once the worktree exists

The aliases replace the merged configuration's roles in `prepare`, so an unresolvable alias refuses through the existing `resolveRoles` message before the lock, enrollment or any write. After every refusal the command can raise, including `--implement` on an archived change, and before the run advances, the loop writes the four `roles` entries into `openspec/loop.local.yaml` in the run's worktree, creating the file when absent. It edits the parsed YAML document so other settings and comments stay as they were.
