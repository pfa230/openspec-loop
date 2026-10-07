## Why

The README's editing Claude agent cannot run shell commands, so an implementer configured from it cannot run the checks or its own code and cannot verify its work (#38). Headless Claude Code under `--permission-mode acceptEdits` approves file edits, common filesystem commands and read-only commands, and denies any other command that would need approval, such as running the tests, because nobody can give it. #10's clean-project run paid for a plan revision and a second review on this, and its implementer then ticked tasks without running anything.

## What Changes

- **Claude's editing arguments become `--permission-mode auto`**, in the README's example configuration and in the adapter table. Auto mode lets a classifier approve routine commands, so the implementer edits files and runs commands in the run's worktree headless.
- **The adapter table's Claude Code version moves to 2.1.293**, the version both of its arguments were verified with. The other rows stay as they are: Codex's and OpenCode's editing arguments held on the versions the table already names, and Antigravity's editing argument held on 1.3.0, where its reviewer column was not re-verified.
- **The paragraph on worktrees inside the Git directory changes.** In auto mode, Claude Code's classifier judges edits inside a `.git` directory instead of refusing them, and `bypassPermissions` remains the way to approve every one.
- **The README says what happens when auto mode is unavailable.** Claude Code then starts in its default mode, which denies the commands an implementer needs to run, such as the checks.

Not in this change:

- Reviewer arguments. The probes for this change found that a harness's own user configuration can loosen them: Codex's `approvals_reviewer = "auto_review"` lets a `-s read-only` reviewer write, and Antigravity's `toolPermission: always-proceed` lets a reviewer write even with `--mode plan`. That defect gets its own issue.
- Code, test, skill or contract edits. The adapters already pass the agent's arguments through unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The contract's Execution restrictions requirement already makes an agent's restrictions part of its command. This change corrects documentation only, so it sets `skip_specs: true`.

## Impact

- `README.md`: the example configuration, the adapter table and the paragraphs under it.
