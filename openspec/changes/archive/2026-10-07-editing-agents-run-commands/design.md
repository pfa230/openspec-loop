## Context

The README gives one example configuration and an adapter table of restriction arguments per harness (`README.md`, "Configuration" and "Agents and adapters"). The adapters pass an agent's arguments to the harness unchanged (`src/adapters/*.ts`), so an agent's restrictions are configured through its command, on top of the harness's own settings. Harness versions on this host: Claude Code 2.1.293, Codex 0.160.0, Antigravity 1.3.0, OpenCode 1.18.34. See proposal.md for why.

The probes behind the decisions below ran each shipped adapter, built from `main` at 24acb8e, in a fresh worktree of a scratch repository. The editing probe asked the agent to run `sh test.sh`, which prints a random token, and write that line to `notes.txt`; only an agent that ran the command can write it. The reviewer probe asked the agent to read `test.sh`, then try to create `notes.txt`. Every probe ran with pfa's own harness configuration.

| Agent arguments | Result |
|---|---|
| `loop-claude --model sonnet --permission-mode acceptEdits` | Denied `sh test.sh` (`permission_denials`), wrote nothing |
| `loop-claude --model sonnet --permission-mode auto` | Ran the command and wrote the file |
| `loop-claude --model sonnet --permission-mode acceptEdits --allowedTools Bash` | Ran the command and wrote the file |
| `loop-claude --model sonnet --permission-mode bypassPermissions` | Ran the command and wrote the file |
| `loop-claude --model sonnet --permission-mode auto`, worktree inside `.git` | Ran the command and wrote the file, with no denials |
| `loop-claude --model sonnet --permission-mode plan` (reviewer) | Read the file, wrote nothing |
| `loop-codex -m gpt-5.5 -s workspace-write` | Ran the command and wrote the file |
| `loop-opencode` (no arguments) | Ran the command and wrote the file |
| `loop-agy --dangerously-skip-permissions` | Ran the command and wrote the file, on the second try; the first hit a 502 from Google's eligibility check |

## Goals / Non-Goals

**Goals:**

- An implementer or plan reviser configured from the README edits files and runs commands in the run's worktree, headless, with every shipped adapter.

**Non-Goals:**

- Reviewer arguments, which the proposal leaves to their own issue.
- Arguments that hold regardless of a person's own harness configuration. The probes ran under one person's settings, as every real run does.

## Decisions

**1. Claude's editing arguments are `--permission-mode auto`.** pfa chose it from three modes that all passed the editing probe. Auto mode approves edits in the working directory and has a classifier review the commands that would need approval, which keeps the copied example from handing an unattended agent every permission. Alternatives:

- `--permission-mode bypassPermissions` runs everything, `.git` writes included, with no classifier. Claude Code's documentation reserves it for containers and VMs, and it offers no protection against prompt injection.
- `--permission-mode acceptEdits --allowedTools Bash` runs every Bash command. Bash can write anywhere, so the edit scope it keeps is cosmetic, and it needs two arguments where one does.

**2. The table's Claude Code version becomes 2.1.293; no other version changes.** The table says each adapter was verified with the version shown. Both Claude arguments, `plan` for reviewers and `auto` for editors, passed on 2.1.293. Codex's and OpenCode's editing arguments held on 0.160.0 and 1.18.34, the versions the table already names. Antigravity's editing argument held on 1.3.0, but its reviewer column was not re-verified there, so its row keeps 1.2.17, where both were verified.

**3. The worktrees-inside-`.git` paragraph describes auto mode.** Claude Code never auto-approves writes to protected paths such as `.git`, except under `bypassPermissions`; in auto mode the classifier judges them instead. The probe in a worktree inside `.git` passed, but a classifier can block an edit there. The paragraph says so and keeps `bypassPermissions`, inside a sandbox, as the way to approve every such edit.

**4. The README names auto mode's failure.** Auto mode needs a model and account that support it. Without it, Claude Code starts in its default mode, which denies the commands an implementer needs, such as the checks: the same failure as #38. One sentence in the Agents and adapters section says so, because nothing else in a run reports it.

## Risks / Trade-offs

- [The classifier blocks a command an implementer needs, such as an unusual required check] → The loop's own required checks still run after every implementer turn that succeeds, so a failure the implementer could not see still reaches it as a finding. `bypassPermissions` inside a sandbox remains documented for anyone who needs determinism.
- [Auto mode is unavailable to a reader's account or model] → Decision 4 tells them what fails and why.
- [A person's harness configuration overrides the arguments] → Out of scope here. The reviewer issue covers the case the probes found.
