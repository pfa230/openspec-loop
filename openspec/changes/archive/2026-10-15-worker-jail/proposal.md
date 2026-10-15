# Proposal

## Why

An editing worker runs with its harness's permissions, which either block work an implementer needs, such as writing a screenshot to `/tmp`, or let the model read and write anything its user can. OpenCode has no sandbox at all, and `loop-opencode --auto` approves every permission request, which security reviews flag. The contract already lets an agent's command wrap its adapter in a sandbox, but a user who tries ai-jail by hand needs about twenty flags, per-harness credential paths, and protections they are unlikely to find. A worker that can write the repository's Git hooks or configuration, or the worktree's `.git` file, gets code run on the host by the loop's next Git command. The package should ship one wrapper that confines any worker correctly.

## What Changes

- The package ships `loop-jail`, a worker command that runs another worker command under [ai-jail](https://github.com/akitaonrails/ai-jail): `[loop-jail, loop-opencode, --auto]`, `[loop-jail, loop-claude, --model, opus, --permission-mode, bypassPermissions]`.
- Inside the jail, the worker can write only the worktree, its private `/tmp` and home, and its harness's credential file. It keeps network access, so the checks, `openspec`, Git reads and a headless browser work.
- The repository's Git directory and the worktree's `.git` file are read-only to the worker. The wrapper has the adapter write its reply and usage outside the Git directory, then hands them to the loop at the paths it gave.
- For the four shipped adapters, the wrapper shares the harness's credential file writable, and its executable and user configuration read-only. Everything else the harness writes is discarded when the worker ends.
- A missing `ai-jail` fails the worker explicitly. The wrapper preserves the wrapped command's exit status.
- The README documents the wrapper, ai-jail as its prerequisite, how to extend it through ai-jail's own configuration, and what the jail does not protect: it prevents accidents, not deliberate sabotage; credentials stay readable to the model on an open network; and checks, and hooks kept in the worktree, run outside the jail.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: a new Shipped sandbox wrapper requirement, under the existing Execution restrictions requirement, which already allows a wrapping command.

## Impact

- `src/jail.ts` (new) and `package.json`: the `loop-jail` bin.
- `test/jail.test.ts` (new): the wrapper against a stub `ai-jail`.
- `README.md`: prerequisites, installation and a sandboxing section. It supersedes the unmerged documentation-only pull request #79.
- New optional external dependency: ai-jail, needed only by agents that use `loop-jail`. Verified with ai-jail 2.2.0 on Linux.
