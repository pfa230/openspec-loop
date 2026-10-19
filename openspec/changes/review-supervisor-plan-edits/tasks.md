## 1. Explicit proposal review restart

- [ ] 1.1 Add resume-only `--review` parsing and preparation under the existing run lock, reusing plan reopening, clearing owed proposal revision and implementation findings, and refusing after archival as described in the design. Extend the existing CLI cases for the new option and stage tests to show that edited plans stopped during implementation or after implementation begin with a new proposal review, existing branch work remains, an owed old proposal revision is not run first, and an archived change is refused without changing state. Update the README command and approval guidance alongside the option. Verify with `npm test`.

## 2. Supervisor recovery guidance

- [ ] 2.1 Update `skills/openspec-loop/SKILL.md` and the README supervision recovery guidance to commit supervisor plan edits on the run's branch and resume with `--review`, replacing the current `--implement` plan-edit recovery. Refresh the tracked `.agents/skills/openspec-loop/` and `.claude/skills/openspec-loop/` copies with the existing setup command. Review the resulting diff and all plan-edit recovery references for consistency, preserving the existing rules for user-requested stops, stage boundaries and unresolved decisions.
