## Why

`loop run` on the default branch creates the change's worktree inside the repository's Git directory, at `<git-common-dir>/openspec-loop/<change>/worktree`. Claude Code treats every path inside a `.git` directory as sensitive, so an editing Claude agent there is denied under `--permission-mode acceptEdits` and needs `bypassPermissions`. The same holds for a supervising Claude session that records a decision in the run's worktree. The plan reviser hits this today, and #5's implementer would too, so the location must change before #5.

The build-controller change put the worktree in the Git directory only so it never shows as untracked in the user's checkout. It rejected `.worktrees/<change>` because the loop would have had to edit `.git/info/exclude`. Making the location a setting the user chooses, and leaving ignoring it to the user, removes both problems without the loop touching Git configuration.

## What Changes

- `openspec/loop.yaml` gains a required `worktrees` field with no default. It names the directory under which `loop run` on the default branch creates each change's worktree, at `<worktrees>/<change>`.
- A relative `worktrees` path resolves against the repository's main worktree, so `loop run` puts runs in the same place whichever checkout it is given from. An absolute path is used as given.
- The loop does not edit `.gitignore`, `.git/info/exclude` or any other Git configuration. The README tells the user to ignore the directory when it lies inside a checkout.
- A run's worktree is fixed when `loop run` creates it, because `state.json` records it. Changing `worktrees` affects only runs created afterwards.
- Run state, the lock and transcripts stay in `<git-common-dir>/openspec-loop/<change>/`.
- The README's example configuration, adapter table, `.git` note and discard instructions change to match. The `loop-claude` reviser arguments become `--permission-mode acceptEdits`.
- **BREAKING** (configuration): an `openspec/loop.yaml` without `worktrees` is refused until the user adds the field.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`:
  - Loop configuration: adds the required `worktrees` directory, how a relative path resolves, that a run keeps the worktree it was created with, and that the loop does not change Git's ignore rules or configuration.
  - Integration and delivery: a default-branch run leaves the invoking checkout's files and index untouched, rather than the whole checkout, since a worktrees directory inside it may appear as untracked.

## Impact

- `src/config.ts`: parse, merge and require `worktrees` as a non-empty string.
- `src/commands.ts`: create the default-branch run's worktree at `<worktrees>/<change>`, resolving a relative path against the main worktree.
- Tests: the test configuration gains `worktrees`, and the test repositories ignore it in `.git/info/exclude` as the README tells users to. New tests cover a relative path given from a linked worktree, an absolute path, a missing or malformed field, and a resume after `worktrees` changed.
- `README.md`: configuration, adapters and discarding a run.
- Existing runs keep working: resume uses the worktree path in `state.json`.
- Delivery in `merge` mode (#7) needs every checkout holding the default branch to be clean. An unignored worktree directory inside that checkout makes it dirty, and #7's existing rule stops the run and names the checkout. This change adds no check for it.
