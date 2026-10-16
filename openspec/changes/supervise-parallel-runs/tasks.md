# Tasks

## 1. Supervision skill

- [ ] 1.1 In `skills/openspec-loop/SKILL.md`, add a section on supervising several runs as the design describes: start every named change's `loop run` without waiting, one log and one watcher per run in Claude Code (labeled relay, per-run line counts for re-arming) and in Codex (one `exec_command` session per run, polled in turn), single-run handling for each run that ends while the others continue, and the final summary in the order the user named them. Verify by reading the section against the "Supervising several runs" requirement and its three scenarios.
- [ ] 1.2 In `README.md`'s "Supervising from Claude Code or Codex" section, add that the skill can run several named changes at once, each in its own worktree, with labeled progress and a final summary. Verify the README states what the requirement states and nothing more.

