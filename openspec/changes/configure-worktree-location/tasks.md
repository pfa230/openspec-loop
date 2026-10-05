## 1. Configuration

- [x] 1.1 Add `worktrees` to `src/config.ts` as a top-level non-empty string that the local file replaces as a whole and that is required after merging; extend the "not found" refusal text to name it. Verify with tests that a configuration without `worktrees` is refused naming `"worktrees"`, that a non-string is refused naming the field and the file, and that a local value replaces the committed one
- [x] 1.2 Update the test helper: `configYaml` writes `worktrees: .worktrees`, `makeRepo` appends `.worktrees/` to the test repository's `.git/info/exclude`, and `repo.worktree` becomes `<top>/.worktrees/<change>`; update tests that build the old `<run dir>/worktree` path (`test/control.test.ts`, `test/controller.test.ts`, `test/enrollment.test.ts`). Verify with `npm test`

## 2. Enrollment

- [x] 2.1 In `enroll` (`src/commands.ts`), on the default-branch path, resolve `worktrees` against the invoking checkout when it is relative, use it as given when absolute, and create the worktree at `<worktrees>/<change>`. Verify with tests that a default-branch run creates `<top>/.worktrees/add-thing` and records it in `state.json`, that a run given on the default branch in a linked worktree creates it under that worktree, and that an absolute `worktrees` outside the repository creates `<directory>/add-thing`
- [x] 2.2 Verify with tests that a run stopped by a failing fixture and resumed after `worktrees` changed continues in its recorded worktree, and that with `.worktrees/` not ignored, a default-branch run leaves `.gitignore` and `.git/info/exclude` byte-identical and the checkout's `git status --porcelain --untracked-files=all` gains `?? .worktrees/add-thing/`

## 3. Documentation

- [x] 3.1 Update `README.md`: add `worktrees` to the example configuration and the field list, saying a relative path resolves against the checkout where `loop run` is given and an absolute one is used as written, a run keeps the worktree it was created with, the loop never edits ignore rules, and the user should add the directory to `.gitignore` or `.git/info/exclude` when it lies inside a checkout, because an unignored one makes that checkout dirty; change the `loop-claude` editing reviser arguments to `--permission-mode acceptEdits`; rewrite the `.git` paragraph to say that a `worktrees` directory inside the Git directory needs `bypassPermissions` for an editing Claude agent; state that run state and transcripts stay in the Git directory while a default-branch run's worktree is under `worktrees`, drop "Nothing is written to your checkouts", and change "leaves your checkout untouched" in "Running a change" to say the run leaves your checkout's files and index untouched; and rewrite the discard steps to take the worktree and run directory from `loop status <change>` before removing them. Verify by following the documented configuration and discard steps against a fixture run in a temporary repository, and that `loop run` then starts the same change again

## 4. Integration check

- [x] 4.1 Run `npm test` and confirm every test passes
