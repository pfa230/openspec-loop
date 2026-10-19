# Tasks

## 1. OpenSpec proposing templates

- [ ] 1.1 In an OpenSpec source worktree, after reconciling its repository instructions and specs, add the summary bullet from design.md to the `Output` sections returned by `getOpsxProposeSkillTemplate()` and `getOpsxProposeCommandTemplate()`; review the source diff and run that repository's required checks. Build the CLI and use its native generation/update flow in a disposable project configured for Codex skills and Claude skills/commands, then run `openspec update --force` again and verify the summary instruction remains before the artifact list in the generated proposing files.
