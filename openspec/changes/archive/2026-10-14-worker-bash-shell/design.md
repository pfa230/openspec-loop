# Design

## Context

Workers start in `startWorker` (`src/step.ts`), which calls `runStep` and so inherits the loop's whole environment. Each harness picks its command shell differently. The table was checked on a host whose `SHELL` and passwd shell are linuxbrew zsh, by having each harness run `echo "zsh=[$ZSH_VERSION] bash=[$BASH_VERSION]"`:

| Harness | Default | With `SHELL=/bin/bash` | Selection |
|---|---|---|---|
| Claude Code 2.1.300 | zsh | bash (also with `SHELL=bash`) | `CLAUDE_CODE_SHELL`, then `SHELL`, then zsh before bash |
| OpenCode 1.18.34 | zsh | not run | `shell` config, then `SHELL`, resolving a bare name on PATH (`packages/core/src/shell.ts`) |
| Codex 0.162.1 | bash | bash | passwd login shell via `getpwuid_r`, never `SHELL` |
| Antigravity 1.3.5 | bash | bash | undocumented; ignored `SHELL` |

## Goals / Non-Goals

**Goals:**

- Every worker gets bash as `SHELL`, set in one place for all harnesses.

**Non-Goals:**

- Forcing Codex's shell. It reads the passwd entry, so forcing it would need a Codex-specific override; the README documents the limit.
- Changing the environment of checks, archival or Git commands. They are configured or fixed commands, not model-written ones.
- Changing OpenCode's `doom_loop` handling. In OpenCode 1.18.34 the guard's ask runs before the tool and outside its error handling, so any rejection, with or without feedback, halts the session, while approval switches the guard off.
- A configuration option for the worker shell. An operator who wants another shell sets the harness's own setting, which outranks `SHELL`.
- A loop-side check that bash exists. Bash is a README prerequisite, as Git is.

## Decisions

- **Set `SHELL` at worker start.** `startWorker` passes `{ ...process.env, SHELL: "bash" }` to `runStep`, which gains an `env` parameter defaulting to `process.env`. Per-harness settings (`CLAUDE_CODE_SHELL`, OpenCode's `shell` config) would be four mechanisms instead of one and would override settings the operator chose.
- **A bare `bash`, not a resolved path.** Claude Code accepted `SHELL=bash` in the check above, and OpenCode resolves a bare name on PATH. A loop-side PATH lookup would add code and a failure path without fixing a case either harness gets wrong; a hard-coded `/bin/bash` would break hosts such as NixOS that have none.

## Risks / Trade-offs

- An agent wrapped in a sandbox such as `ai-jail` gets `SHELL=bash` and resolves it inside the jail. [assumption: ai-jail passes the environment through and exposes bash on the jail's PATH]
- Operators who relied on their zsh environment inside a harness lose it unless they set the harness's own shell option.
- On a host whose login shell is a system zsh, Codex still runs zsh.
- On a host without bash, the harness falls back on its own: OpenCode to `/bin/sh` on Linux and `/bin/zsh` on macOS, Claude Code to zsh.
