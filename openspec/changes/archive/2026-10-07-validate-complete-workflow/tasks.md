## 1. Setup

- [x] 1.1 Run `npm ci`, `npm test` and `npm link` in this worktree, as design.md decision 3 describes. Verify that `npm test` passes and, with `command -v`, that `loop`, `loop-claude`, `loop-codex`, `loop-agy` and `loop-opencode` resolve to this worktree's build

## 2. Supervised runs

Each task posts its run's comment on #9 with the content of design.md decision 2, files an issue for each defect as decision 1 describes, and links it from the comment.

- [x] 2.1 Run A of design.md decision 7, supervised by Claude Code in tmux as decision 6 describes. Verify on the run's progress lines and Git state that:
  - before the run, the base passes the hidden check;
  - the first proposal review is `REVISE`, the plan reviser revises without the user, and a later review approves;
  - the first implementation attempt fails the hidden check, and the implementer revises from its output until the checks pass and review approves;
  - the pushed commit from the second clone is integrated, the fast-forward of the local default branch has its own progress line, and both `main` and `origin/main` end at the change's archive commit;
  - the session relayed each progress line as it arrived and showed the report.
- [x] 2.2 Run B of design.md decision 7, supervised by Codex in tmux, with a private disposable GitHub repository created by `gh repo create --private`. Verify that:
  - the run stops with the reviewer's question, the session shows it unchanged and does not answer it, and records the user's answer in `design.md` on the run's branch and resumes only after a separate agreeing turn;
  - the resumed run reviews the plan again;
  - `loop stop`, asked for in a user turn during implementation, ends the step, and a resume after agreement redoes it and continues;
  - one pull request is open against `main` with the archived proposal as its body, and local `main` is unchanged.

  Put the repository's URL in the comment so pfa can delete it.

## 3. Terminal runs and diagnosis

- [x] 3.1 Runs C and D of design.md decision 7 in one repository from plain terminals. Verify that:
  - C's first `loop run` stops with an execution failure naming the step, the agent and its transcript;
  - a Claude session and a Codex session, each in tmux with the skill, diagnose that stop by reading only: each quotes the harness's error from the transcript, names the cause and proposes a recovery, and `git status` and the run directory are unchanged afterwards;
  - after the model is fixed in `openspec/loop.local.yaml`, `loop resume` completes C with one agent in all four roles, each review in its own transcript and leaving the worktree unchanged;
  - D, started while C runs, completes with its own run directory, branch and worktree, and C's state is untouched by it;
  - after `kill -9` on D's `loop run` during a worker step, `loop status` shows D interrupted, and once the worker's process group has exited, `loop resume` takes it over and redoes that step;
  - a third change created, edited, archived and committed natively in the main checkout during both runs goes through without a refusal or a check from the loop, and `.git/hooks` holds only Git's samples;
  - both runs end in `local` delivery with nothing pushed, and `main` holds the native work's commits and no commit of either run.
- [x] 3.2 Run E of design.md decision 7. Verify that the required check fails on the base before the run, that the run stops after two implementation attempts with the check's output, that the patch touches nothing outside the plan, and that a Claude session and a Codex session each explain from the findings and the diff between attempts that the failure is pre-existing, propose a recovery, and change nothing
- [x] 3.3 Run F of design.md decision 7, in the order that decision gives. Verify that:
  - unpushed commits stop the run at integration, naming both branches, with neither changed;
  - diverged branches stop the run at integration, naming both branches, with neither changed;
  - the dirty checkout stops the run before the fast-forward, naming the checkout, with the local default branch unchanged;
  - the rejected push stops the run at delivery with Git's message, with the local default branch unchanged;
  - after each recovery, `loop resume` continues from the stage that stopped, and the last resume completes with `main` and `origin/main` at the run's branch tip, which contains the change's archive commit.

## 4. Summary

- [x] 4.1 Post the closing comment on #9 that design.md decision 2 describes. Include the operator step counts of decision 8 for `local`, `pr` and `merge`, and the implementer's per-attempt usage from runs A and E. Verify that every case in proposal.md appears once with pass, defect and its issue, or unsupported and the reason, and that every scope and acceptance item of #9 points to a case
- [x] 4.2 For each defect issue whose fix is merged, merge the default branch into this branch, rebuild, run the failed case again and post its result on #9. Verify that the closing comment's mapping has no case left as a defect
- [x] 4.3 Run `npm unlink -g openspec-loop`. Verify that `command -v loop` finds nothing
