# Tasks

## 1. Supervision skill

- [x] 1.1 In `skills/openspec-loop/SKILL.md`, add a section on supervising several runs as the design describes: the dependency check before start (read each named plan, flag unlanded dependencies with evidence, propose drops, wait for the confirmed list, start at once when nothing is flagged), the refusal of a batch invoked from a branch other than the default branch (name both branches, start no run), start every change to run's `loop run` without waiting, one log and one watcher per run in Claude Code (labeled relay, per-run line counts for re-arming) and in Codex (one `exec_command` session per run, polled in turn), single-run handling for each run that ends while the others continue, and the final summary of the changes it ran in the order the user named them. Verify by reading the section against the "Supervising several runs" requirement and its five scenarios, including that a batch invoked off the default branch starts no run.
- [x] 1.2 In `README.md`'s "Supervising from Claude Code or Codex" section, add that the skill can run several named changes at once from the default branch, each in its own worktree, after flagging changes that need unlanded work and proposing to drop them, with labeled progress and a final summary. Verify the README states what the requirement states and nothing more.

