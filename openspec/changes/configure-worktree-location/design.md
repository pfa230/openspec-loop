## Context

`enroll` in `src/commands.ts` creates a default-branch run's worktree with `git worktree add -b loop/<change> <git-common-dir>/openspec-loop/<change>/worktree <head>` and records the path in `state.json`. `resume`, `status`, the report and every worker use the recorded path, never a recomputed one. `src/config.ts` merges `openspec/loop.yaml` with `openspec/loop.local.yaml`, replacing `defaultBranch` as a whole and `agents`, `roles` and `attempts` entry by entry, and refuses a required field missing after the merge. See proposal.md for motivation and the `loop-workflow` delta for the requirements.

These facts were checked on this host with Git 2.53.0 and Claude Code 2.1.289:

- `claude -p --permission-mode acceptEdits` asked to write a file creates it in a worktree at `<repo>/.worktrees/a`, and does not create it in a worktree at `<repo>/.git/openspec-loop/g/worktree`.
- A worktree at `<repo>/.worktrees/a` shows in that checkout's `git status --porcelain --untracked-files=all` as `?? .worktrees/a/`, and disappears from it once `.worktrees/` is in `.git/info/exclude`.
- `git worktree add` creates missing leading directories of the worktree path.

## Goals / Non-Goals

**Goals:**
- An editing Claude agent works in a default-branch run's worktree under `acceptEdits`, when the user puts `worktrees` outside the Git directory.

**Non-Goals:**
- Moving the worktree of an existing run. It stays where `state.json` says.
- Moving run state, the lock or transcripts out of the Git directory. Workers never edit them: adapters write the reply files, and the loop writes the rest.
- Detecting or reporting an unignored worktrees directory. Delivery in `merge` mode (#7) already stops on a dirty checkout and names it.

## Decisions

**`worktrees` is required and has no default.** pfa decided this in #19. The user names the location once, beside `defaultBranch`, and chooses whether it lies inside a checkout. A default would pick for the user a location that either needs ignoring or lies outside the repository. Like `defaultBranch`, it is a top-level string the local file replaces as a whole, so a person can keep their worktrees elsewhere without changing the committed file. The loop checks only that it is a non-empty string. It does not refuse a path inside the Git directory or one that Git does not ignore: those are the user's choices, and the README states their consequences.

**A relative path resolves against the checkout where `loop run` is given.** That checkout holds the default branch, and agent command paths containing `/` already resolve against it, so the loop has one rule for relative paths. pfa replaced #19's main-worktree rule with this one: finding the main worktree needs `git worktree list`, it matters only when the default branch is checked out in a linked worktree, and with `git init --separate-git-dir` Git reports the Git directory as the main worktree, so the lookup would put runs there.

**The change's worktree is `<worktrees>/<change>`.** The loop passes the path to `git worktree add` and adds no checks of its own: Git creates missing leading directories, and refuses a non-empty existing path with a message naming it, which the loop reports as the refusal, as it does for an existing `loop/<change>` branch.

**The run keeps its worktree.** `state.json` already records the worktree, and only `enroll` reads `worktrees`. Changing the setting therefore affects new runs only, which matches the delta's "Configuration changed while stopped" scenario: the resumed run reads the edited configuration, and `worktrees` names where new runs go. Runs created before this change keep their worktree in the Git directory and resume there. `resume` still refuses a configuration without `worktrees`, because `run` and `resume` read one configuration with the same required fields.

**The loop never edits Git ignore rules.** pfa decided this in #19, and build-controller rejected editing `.git/info/exclude` for the same reason. The README tells the user to add the directory to `.gitignore`, so every clone ignores it, or to `.git/info/exclude`, to ignore it in one clone only. An unignored directory inside a checkout makes that checkout dirty. Then a change-branch `loop run` given in that checkout is refused by the existing clean-worktree rule, and #7's `merge` delivery stops and names the checkout.

**The direct `claude` call settles #19's real-run check, and no task repeats it through the loop.** `loop-claude` passes the agent's arguments to `claude` unchanged (`src/adapters/claude.ts`), so the permission mode it runs under is the one the direct call tested. pfa decided against a task that repeats the check through the adapter or a loop run.

**The README states the `.git` restriction once, beside the adapters.** The `loop-claude` reviser arguments become `--permission-mode acceptEdits`. The paragraph on `.git` keeps the fact that Claude Code refuses edits inside a `.git` directory under `acceptEdits`, and says the consequence: a `worktrees` directory inside the Git directory needs `bypassPermissions` for an editing Claude agent. The discard steps take the worktree and run directory from `loop status`, because the worktree path now depends on configuration.

**Tests ignore the worktrees directory the way the README says.** The test configuration sets `worktrees: .worktrees`, and `makeRepo` adds `.worktrees/` to the test repository's `.git/info/exclude`, so existing assertions that the invoking checkout's status is unchanged keep holding. `repo.worktree` becomes `<top>/.worktrees/<change>`. One test leaves the directory unignored and asserts the untracked entry and unchanged ignore files.

## Risks / Trade-offs

- [Every existing `openspec/loop.yaml` is refused until it gains `worktrees`] → The refusal names the missing field. The package is unreleased and its only users are its authors.
- [A worktree inside a checkout is visible to tools that walk that checkout, such as a test runner or a search] → The user chooses the location; an absolute path outside the repository avoids it.
