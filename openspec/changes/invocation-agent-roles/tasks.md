# Tasks

## 1. Role agents on the command

- [ ] 1.1 Parse zero or four aliases after the change name for `run`, `step` and `resume` in `src/cli.ts`, with `resume` options after the aliases, and update the usage text. Add CLI tests: four aliases accepted on each command, and on resume followed by `--attempts`; three aliases print usage, exit 2 and create no run. Verify with `npm test`.
- [ ] 1.2 Apply the aliases over the configured roles before resolution in `prepare`, then write them as the `roles` entries of the run worktree's `openspec/loop.local.yaml` after the command's last refusal and before advancing, keeping other content. Add tests: a run started with four aliases runs each role with its agent and leaves the file with those roles; an existing local file keeps its other entries; a later resume from the run's worktree without aliases uses them; an undefined alias or missing command refuses, names the role and alias, and writes nothing. Verify with `npm test`.
- [ ] 1.3 Document the form in the README's command table and configuration section, and update `skills/openspec-loop/SKILL.md` so its command list shows the aliases and the skill passes four agents the user names, in role order. Verify by reading both against the spec delta.

## 2. Integration

- [ ] 2.1 Run `npm test` and `openspec validate invocation-agent-roles --strict --no-interactive`, and confirm the diff touches only the CLI, commands, config, their tests, the README, the supervision skill and this change.
