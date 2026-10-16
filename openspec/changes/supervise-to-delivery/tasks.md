# Tasks

## 1. Let the supervisor recover

- [ ] 1.1 Update `skills/openspec-loop/SKILL.md` to match the Supervision skill delta. Replace the agreement rule on line 22 and "Do nothing more until the user chooses" in step 4 with the autonomous recovery: plan edits committed on the run's branch and the resume commands. Add the hand-over cases and the repeated-cause rule. Keep diagnosis read-only, a user-requested stop stopped, and `loop step` boundaries waiting. Rewrite "Answering a decision stop" so the supervisor answers settled questions with their source, hands over only open questions, and treats the user's answers as authorization to record, commit and resume. Verify by walking the changed skill through every added and modified scenario in the delta.
- [ ] 1.2 Refresh `.agents/skills/openspec-loop/SKILL.md` and `.claude/skills/openspec-loop/SKILL.md` from the bundled skill. Verify with `cmp` that both match it.
- [ ] 1.3 Update the README's "Supervising from Claude Code or Codex" paragraphs to describe autonomous recovery, the hand-over cases and the decision handoff for open questions. Verify the wording matches the skill and the delta.

## 2. Verify the change

- [ ] 2.1 Run `openspec validate supervise-to-delivery --strict`, `git diff --check` and `npm test`, and confirm that all pass.
