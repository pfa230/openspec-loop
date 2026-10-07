## 1. The diagnosis reads the failing agent's command

- [ ] 1.1 In the "Diagnosing a stop" section of `skills/openspec-loop/SKILL.md`, add `openspec/loop.yaml` and `openspec/loop.local.yaml` in the checkout where you gave the `loop` command to the permitted reads; the run's worktree lacks the uncommitted local file. In step 2, add a sentence: for a worker's failure, read the entry under `agents` for the alias the cause names, the local file's when it defines the alias and the committed file's otherwise, and check the command's arguments, such as the model, against the error. Verify by reading the section against the Supervision skill requirement in the change's spec delta, and against run C of #9: it leads a session from `execution failure of proposalReviewer agent "solo"` to `-m openrouter/no-such/model`, also when `openspec/loop.yaml` defines another `solo`

## 2. Final checks

- [ ] 2.1 Run `openspec validate diagnose-agent-command --strict` and `npm test`, and verify both pass
