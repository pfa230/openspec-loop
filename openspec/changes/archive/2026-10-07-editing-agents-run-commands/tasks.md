## 1. README

- [x] 1.1 In `README.md`, change the example agent `opus` to `[loop-claude, --model, opus, --permission-mode, auto]`, change the adapter table's `loop-claude` row to Claude Code 2.1.293 with editing arguments `--permission-mode auto`, rewrite the paragraph on worktrees inside the Git directory as design decision 3 says, and add the sentence on auto mode's availability from design decision 4 to the same section. Verify that `rg -n acceptEdits README.md` prints nothing and that the Codex, Antigravity and OpenCode rows are unchanged.

## 2. Final checks

- [x] 2.1 Run `openspec validate editing-agents-run-commands --strict` and `npm test`, and verify both pass.
