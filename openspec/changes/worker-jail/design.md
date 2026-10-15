# Design

## Context

The loop starts a worker by appending the prompt, schema, reply and usage paths to the agent's command, in the run's worktree, with `SHELL=bash`, as its own process group, and stops it by killing that group (`src/step.ts`). The four paths live under the run directory inside the repository's Git common directory. The Execution restrictions requirement already lets an agent's command wrap its adapter. See proposal.md for why the package ships the wrapper.

The facts below were verified with ai-jail 2.2.0, Claude Code 2.1.300, Codex 0.162.1, Antigravity 1.3.5 and OpenCode 1.18.34 on Linux while preparing this change:

- `ai-jail --exec` runs a command non-interactively in bwrap with a private tmpfs home and `/tmp`, and the current directory (the worktree) writable. Network is off by default; `--network` turns it on.
- Without `--no-save-config`, ai-jail writes a `.ai-jail` file into the worktree.
- ai-jail passes the caller's `PATH`, dropping entries not visible inside the jail, and skips a map whose path does not exist.
- ai-jail refuses a writable map nested inside a read-only map ("ignoring rw-map that overlaps a read-only map destination"), and a read-only map nested inside a writable one drops the writable map. A read-only map nested inside the writable worktree, such as its `.git` file, works.
- With the Git common directory mapped read-only and ai-jail's own `--worktree` off, `git status`, `git diff` and `git log` work in the worktree, and writes to hooks, configuration, the index and the per-worktree metadata fail.
- A host directory mapped writable, outside the worktree, keeps what the jailed command writes there.
- Node resolves an npm bin through every symlink hop: with only `~/.local/bin` and the package directory mapped, `openspec` fails because `~/.npm-global/bin`, the middle hop, is missing.
- Killing the process group that contains `ai-jail` ends the jailed command (bwrap runs with `--die-with-parent`).
- Each harness runs with only its credential file writable and its executable and configuration read-only; Codex's own `-s read-only` sandbox works inside the jail. Antigravity rewrites `bin/agentapi` under its state directory on every start, so that directory cannot be read-only.
- Headless Chrome aborts inside the jail unless started with `--no-sandbox`.

## Goals / Non-Goals

**Goals:**

- One agent-command prefix that confines any worker, with no per-user setup for the shipped adapters.
- No write from inside the jail can make the host run code: Git metadata, the worktree's `.git` file and harness configuration are read-only.

**Non-Goals:**

- Jailing the loop's own commands. Required checks, integration, archival and delivery run on the host as today, so a check runs code the implementer wrote. Prefixing checks is a separate change if wanted.
- Keeping credentials from the model. The harness calls its provider from the process that runs the model's commands, so its credential file and environment are readable inside the jail, and the network is open. ai-jail's `--secret` and `--allow-host` need a host list per project; not provided.
- Harness state locations moved by environment, such as `CLAUDE_CONFIG_DIR`, `CODEX_HOME` or `XDG_DATA_HOME`. The wrapper uses each harness's default location; a moved location leaves the harness unauthenticated, which fails the worker visibly.
- macOS. ai-jail supports it through `sandbox-exec`, but nothing here was verified there.

## Decisions

**D1. A bin in the package that runs ai-jail.** `loop-jail <command> <args>` builds an ai-jail command line and runs it with inherited standard streams. The alternative, documenting flags and a `~/.ai-jail` file for users to write, needs per-user setup that changes with each harness and ai-jail release, and is how the protections in D3 got missed. A loop configuration option that sandboxes every worker was rejected: the contract already puts restrictions in the agent's command, and a wrapper adds no loop state. Users extend the jail through ai-jail's own global configuration, keyed by the wrapped command's name (`[commands.loop-opencode]` in `~/.ai-jail`), for example to pass a provider key with `env_pass` or map a toolchain under home. The wrapper adds no options of its own.

**D2. Fixed ai-jail flags.** `--exec` (no terminal proxy or status bar), `--network`, `--no-save-config`, then `--` and the wrapped command. ai-jail already passes `PATH`, keeping the entries visible inside the jail, and the loop's `SHELL=bash`. ai-jail's `--worktree` stays off; D3 maps the metadata instead.

**D3. Git metadata read-only; reply and usage relayed.** The wrapper maps the Git common directory and the worktree's `.git` file read-only. Protecting only `hooks` and `config` was tried first and is not enough: a rewritten `.git` file, a per-worktree `config.worktree` or `commondir`, or a forged review record under the run directory would each be read by the loop on the host. Because ai-jail refuses a writable map inside a read-only one, the run directory cannot stay writable. Instead, the wrapper creates a host temporary directory, maps it writable, and passes the wrapped command reply and usage paths there in place of the last two arguments. After the command exits, whatever its status, the wrapper copies each file that exists to the path the loop appended and removes the directory. The prompt and schema stay readable where they are. Changing where the loop keeps reply files was rejected: it would change the worker interface for every worker to serve one wrapper.

**D4. Executables mapped along their symlink chain.** For the wrapped command, its harness (D5) and `openspec`, the wrapper resolves the command on PATH and maps read-only the directory of every symlink hop, and the final file's directory, or its npm package directory when the file lies under `node_modules`. This covers npm global installs, the standalone Claude Code, Codex and OpenCode installs, and `~/.local/bin` links, which mapping PATH directories alone does not. A command not found on PATH maps nothing and fails inside the jail with the shell's own error. `node` and `git` are not mapped: the system copies are already visible, and a home-installed Node can be added through `~/.ai-jail`.

**D5. Harness files for the shipped adapters.** Recognized by the wrapped command's base name; ai-jail skips a path that does not exist:

| Adapter | Harness | Writable | Read-only |
|---|---|---|---|
| `loop-claude` | `claude` | `~/.claude/.credentials.json` | `~/.claude/settings.json`, `~/.claude/CLAUDE.md` |
| `loop-codex` | `codex` | `~/.codex/auth.json` | `~/.codex/config.toml` |
| `loop-agy` | `agy` | `~/.gemini/antigravity-cli/antigravity-oauth-token` | `~/.gemini/antigravity-cli/settings.json` |
| `loop-opencode` | `opencode` | `~/.local/share/opencode/auth.json` | `~/.config/opencode` |

Sharing whole state directories, as ai-jail's own agent-state option does for its presets, was rejected: Codex and Antigravity keep executables there, and every harness keeps configuration there that can start commands, such as hooks and MCP servers, so a writable state directory lets the worker plant code that runs in the user's next unjailed session. Symlinked configuration, such as a `settings.json` that links into a dotfiles repository, is shared as its target's content. Plugins, MCP logins and session history kept elsewhere in the state directories are absent inside the jail; another command gets only D2-D4.

**D6. Exit status.** The wrapper exits with the wrapped command's status, or 1 when ai-jail ends by a signal. A spawn failure of `ai-jail` prints an error that names it and exits nonzero. Stopping needs no signal forwarding: the wrapper and ai-jail share the worker's process group, which the loop kills.

## Risks / Trade-offs

- [ai-jail changes a flag or a default] → The README names the verified version; the tests use a stub, so a release should repeat the end-to-end check with the installed ai-jail.
- [A harness moves its credential or configuration file] → The worker starts unauthenticated and fails visibly; update D5's table.
- [Behavior differs from an unjailed worker: no plugins, no MCP logins, Chrome needs `--no-sandbox`] → The README says so, and projects that drive a browser state the flag in their agent instructions.
- [Checks run implementer-written code on the host] → Stated as a non-goal in the README, so users do not read the jail as covering it.
