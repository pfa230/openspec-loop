# Configuration

[README](../README.md) · [Workflow](workflow.md) · [Operations](operations.md)

## Installation and upgrades

The package installs `loop`, four agent adapters and the `loop-jail` sandbox wrapper:

```sh
npm install -g openspec-loop
```

Node 24 or later, Git, Bash, OpenSpec 1.14.0 or later, and the configured agent CLIs must be installed separately. The project must be initialized with OpenSpec and have its native skills or commands installed for the selected tools. Authenticate each harness before running it unattended. `loop-jail` also needs [ai-jail](https://github.com/akitaonrails/ai-jail).

If the npm global prefix belongs to root, set a user-owned prefix to install without `sudo`:

```sh
npm config set prefix ~/.npm-global
```

Add `~/.npm-global/bin` to PATH.

At startup, `loop` appends the directory containing the invoked executable to PATH, so it can find adapters installed beside it even when launched by path. For a symlink, this is the directory containing the link. Existing PATH entries keep precedence. The other required commands must still be installed and available.

To upgrade:

```sh
npm update -g openspec-loop
```

Then run `loop setup` in each project and commit the refreshed skill files.

## Project setup

Create and commit `openspec/loop.yaml`, ignore the worktree directory and `openspec/loop.local.yaml`, then install the bundled skills:

```sh
loop setup
```

Setup installs `loop-propose`, `loop-scope`, `loop-proposals` and `loop-run` into `.agents/skills/` and `.claude/skills/` at the invoking Git checkout's root. It works from a subdirectory or linked worktree and uses the executing package's files, independently of npm's current global prefix.

Rerunning setup replaces the bundled skill directories completely, including local edits and obsolete files. It also removes the retired `openspec-loop`, `openspec-scope` and `openspec-proposals` skill directories. Commit those removals when upgrading from a release that installed them. Unrelated skills, native OpenSpec skills and project configuration are preserved.

Setup accepts no arguments or options. It needs a Git working tree but does not require loop configuration, an OpenSpec root or worker executables. On success, it prints each installed directory and exits 0.

Setup exits 2 before writing files if it receives extra arguments, runs outside a Git working tree, or finds a file or symlink blocking a destination. If it cannot read or copy a source file, it exits 1 and identifies the path. Correct the cause and rerun setup; some copies may already have been refreshed.

The loop installs no Git hooks and requires no custom OpenSpec schema.

## Configuration fields

The [README example](../README.md#getting-started) supplies a complete `openspec/loop.yaml`. After local overrides are applied, a runnable configuration needs all the settings below, including assignments for all four roles. Both attempt counts must be positive integers.

| Field | Meaning |
|---|---|
| `defaultBranch` | The project's default branch, specified explicitly. |
| `worktrees` | Parent directory for default-branch runs (`<worktrees>/<change>`) and scoping sessions (`<worktrees>/scope-<session>`). |
| `agents` | Aliases mapped to command arrays: the executable first, followed by its arguments as separate strings. |
| `roles` | Agent aliases for `proposalReviewer`, `planReviser`, `implementer` and `implementationReviewer`. |
| `attempts.proposalReview` | Proposal reviews allowed in each `run`, `resume` or `step` call. |
| `attempts.implementation` | Implementation attempts allowed in each `run`, `resume` or `step` call. |
| `checks` | Required shell commands, run with `sh -c` in the run's worktree. `[]` explicitly means no checks; omitting the field causes refusal. |
| `delivery` | `local`, `pr` or `merge`, with no default. See [Delivery](workflow.md#delivery). |

Relative `worktrees` paths resolve against the invoking checkout; absolute paths are used as written. Changing this setting does not move an existing run's worktree. Ignore an in-checkout directory through `.gitignore` or, for one clone, `.git/info/exclude`. The loop does not edit ignore rules, and an unignored worktree makes the checkout dirty.

Agent commands run without shell expansion: `~` and `$HOME` in their arrays are passed literally. Each harness/model combination can have its own alias.

The plan reviser also applies minor plan fixes, and the implementer applies minor implementation fixes. One agent can fill several roles, with a fresh context for every turn. `run`, `step` and `resume` can override the four role assignments; see [Commands](operations.md#commands).

`pr` and `merge` use the default branch's configured upstream remote and branch. Without that upstream, `run`, `resume`, `step` and `scope finish` refuse those delivery modes. For a repository whose target is `origin/main`, configure it with:

```sh
git branch --set-upstream-to=origin/main main
```

## Local overrides

Keep machine-specific commands and other uncommitted settings in the ignored `openspec/loop.local.yaml`. Each `run`, `resume` and `step` reads configuration in this order:

1. The invoking checkout's committed `openspec/loop.yaml`.
2. The main checkout's `openspec/loop.local.yaml`, if present.
3. The invoking checkout's local file, if it differs from the main checkout.

`defaultBranch`, `worktrees`, `checks` and `delivery` replace whole values. `agents`, `roles` and `attempts` replace individual entries. For example:

```yaml
agents:
  deepseek: [loop-opencode, -m, deepseek/deepseek-v4]
roles:
  proposalReviewer: deepseek
```

The main checkout is Git's primary working tree, regardless of its current branch. A bare clone has no main checkout, so only the invoking checkout's local file applies. A linked worktree receives the main checkout's settings through this read order, without copying the file.

The commands refuse to proceed if the committed configuration is missing or any applicable file is unreadable, contains invalid YAML, uses unknown keys or has values of the wrong type. After merging the settings, they also check for missing required fields. A worktree override cannot hide an invalid local file in the main checkout. Commands that start workers check that every assigned alias names a defined agent and that its command is available. They do not look up commands for unused agents.

Commands without `/` resolve through PATH. Commands containing `/` resolve against the invoking checkout, even when defined in the main checkout's local file.

Both scope commands use the same merge order and require structurally valid configuration, but neither resolves agent executables nor starts workers.

Git's directory and worktree records identify the main checkout. Commands refuse if those records do not identify an accessible working tree belonging to the clone. With a separated Git directory, direct invocation from the main checkout works; linked-worktree invocation refuses if Git reports the metadata directory instead of the main checkout.

## Agents and permissions

An agent command consists of an adapter and arguments for its harness. The package ships these adapters, verified with the harness versions shown:

| Adapter | Harness version | Reviewer arguments | Editing arguments |
|---|---|---|---|
| `loop-claude` | Claude Code 2.1.293 | `--permission-mode plan` | `--permission-mode auto` |
| `loop-codex` | Codex 0.160.0 | `-s read-only` | `-s workspace-write` |
| `loop-agy` | Antigravity 1.2.17 | none | `--dangerously-skip-permissions` |
| `loop-opencode` | OpenCode 1.19.1 | `--agent plan` | none |

Choose a model with the harness's model flag, such as `--model` or `-m`. Without restriction arguments, the harness uses its own defaults. Headless Claude Code and Codex cannot edit files by default. OpenCode permission requests are denied unless `--auto` is explicit.

Claude Code's auto mode requires a model and account that support it. Otherwise it starts in its default mode and denies commands the implementer needs, including checks. Auto mode can also refuse edits inside a `.git` directory, which matters when worktrees are placed there. `--permission-mode bypassPermissions` approves those operations; [sandboxing](#sandboxing) supplies a separate filesystem boundary.

Workers receive `SHELL=bash`, because models write Bash-shaped commands. Claude Code and OpenCode honor it unless their own shell settings override it (`CLAUDE_CODE_SHELL` and OpenCode's `shell` setting). Codex uses the account's login shell. Antigravity uses Bash.

### OpenCode

The OpenCode adapter starts a local server for one worker turn. The worker must submit its response through the `loop_reply` tool; ordinary text containing JSON does not count. The adapter passes the root session's last completed tool reply to the loop for schema validation. If the worker omits the call, the adapter asks once more in the same session; another completion without it fails the step.

The tool rejects invalid input with errors the model can correct during its turn; it does not repair values. It loads through a temporary `OPENCODE_CONFIG_DIR`, removed when the worker ends, alongside the harness's normal configuration, plugins and authentication. An existing `OPENCODE_CONFIG_DIR` causes refusal.

Supported arguments are `-m`/`--model`, `--agent`, `--variant`, `--auto` and `--pure`, including equals/value forms and explicit false or `--no-auto`/`--no-pure`. Pure mode from the environment is preserved and still loads the reply tool. Other run arguments, including `--attach`, session continuation, file attachments and `--dir`, fail by name before the server starts.

Questions and plan-mode transitions are denied. Permission approval follows the explicit auto setting for both root and delegated sessions; configured denies remain in force. With `--agent plan`, OpenCode rejects reads outside the repository without asking.

The adapter sets no response-header or inactivity timeout for local HTTP requests or the event stream; provider and server limits still apply. Interruption cancels requests and stops the server. API or session failures and unexpected server exits fail the step, preserving reported usage.

Transport errors in the transcript include their cause and available stack. HTTP errors identify the method, path and whether sending the request or reading the response failed. Diagnostics omit request headers and prompt bodies.

### Usage accounting

Adapters report input tokens, output tokens and any harness-reported cost, including after a failed turn. Input includes cached prompt tokens; output includes reasoning tokens. The totals use each harness's native accounting:

| Adapter | Input tokens | Output tokens | USD cost |
|---|---|---|---|
| `loop-claude` | `input_tokens` + `cache_creation_input_tokens` + `cache_read_input_tokens` | `output_tokens` | Reported |
| `loop-codex` | `input_tokens`, including `cached_input_tokens` | `output_tokens`, including `reasoning_output_tokens` | Not reported |
| `loop-agy` | `input_tokens` + `cache_read_tokens` | `output_tokens`, including `thinking_tokens` | Not reported |
| `loop-opencode` | `input` + `cache.read` + `cache.write`, summed across model steps | `output` + `reasoning`, summed across model steps | Reported, summed across model steps |

Claude Code and Antigravity use their final summaries; Codex uses its last completed turn. A total is absent when the harness reported none of its constituent fields. Negative or nonfinite values fail usage validation and stop the run.

Costs are not calculated by the loop. Claude Code reports list price even under a subscription; OpenCode reports zero for a model it has no price for. Treat these as reported usage figures, not a bill. Native cache and reasoning breakdowns remain in the transcript. See [Progress and reports](operations.md#progress-and-reports) for how partial reporting appears.

## Sandboxing

`loop-jail` runs a worker under ai-jail. Prepend it to the adapter command:

```yaml
agents:
  deepseek: [loop-jail, loop-opencode, -m, deepseek/deepseek-v4, --auto]
  claude: [loop-jail, loop-claude, --model, opus, --permission-mode, bypassPermissions]
  codex: [loop-jail, loop-codex, -s, danger-full-access]
```

Under `loop-jail`, use Codex's `-s danger-full-access` for reviewers and editors. Its own Bubblewrap sandbox cannot create a user namespace inside the jail on hosts that restrict unprivileged user namespaces, including Ubuntu 24.04 and later; commands fail with `bwrap: No permissions to create a new namespace`. The jail supplies the filesystem boundary. A jailed Codex reviewer can write the worktree and is instructed not to; the loop does not enforce that restriction.

Inside the jail, a worker can write the worktree, a private `/tmp` and home directory, and its harness's shared credential file. The private directories are discarded when the worker ends; `TMPDIR` is `/tmp`. Network access remains available.

The repository's Git directory and the worktree's `.git` file are read-only. Git reads work; writes to the index, hooks, configuration and worktree metadata fail. The wrapper has the adapter write its reply and usage outside the Git directory, then relays them to the loop even when the worker fails. Only regular files are relayed. A symlink, FIFO or other non-regular file at a relay path fails the wrapper.

The wrapper maps the executable paths for the adapter, harness and OpenSpec read-only, following symlink hops and including their final directories or npm package directories. For shipped adapters it shares these home-directory paths:

| Adapter | Writable credentials | Read-only configuration |
|---|---|---|
| `loop-claude` | `~/.claude/.credentials.json` | `~/.claude/settings.json`, `~/.claude/CLAUDE.md` |
| `loop-codex` | `~/.codex/auth.json` | `~/.codex/config.toml` |
| `loop-agy` | `~/.gemini/antigravity-cli/antigravity-oauth-token` | `~/.gemini/antigravity-cli/settings.json` |
| `loop-opencode` | `~/.local/share/opencode/auth.json` | `~/.config/opencode` |

The harness can update the shared credential file when it refreshes a token, so the new credentials survive after the worker exits. Plugins, MCP logins and session history stored elsewhere are absent from the jail. The wrapper uses the default paths above; a harness configured to store its state elsewhere through `CLAUDE_CONFIG_DIR`, `CODEX_HOME` or `XDG_DATA_HOME` may be unable to authenticate inside the jail.

Extend the jail through ai-jail's global `~/.ai-jail` configuration. Top-level keys apply to every command. For example, a Rust toolchain and build cache can be shared as follows, with `CARGO_TARGET_DIR=~/.cache/cargo-target` set in the host environment:

```toml
# ~/.ai-jail
ro_maps = ["~/.cargo/bin", "~/.rustup"]
rw_maps = ["~/.cargo/registry", "~/.cache/cargo-target"]
env_pass = ["CARGO_TARGET_DIR"]
```

Map the registry writable, since ai-jail places an overlay's upper layer in the worktree. Use a `[commands.<adapter>]` table for settings one harness needs, such as passing a provider key through `[commands.loop-opencode]`. System `node` and `git` are already visible. Headless Chrome needs `--no-sandbox` inside the jail; record that flag in project instructions when browser checks need it.

The jail limits accidental writes. Credentials remain readable to the worker, and its network is open. The loop's checks run on the host and execute code the implementer wrote. A commit can also run a worker-edited hook if `core.hooksPath` points inside the worktree.

`loop-jail` has no options of its own and is verified with ai-jail 2.2.0 on Linux. Missing ai-jail fails the worker by name. Except for relay failures, the wrapper returns the wrapped command's exit status. Custom commands receive the Git metadata and executable maps but no harness-specific home paths.

## Custom adapters

An additional harness needs an adapter implementing the worker interface. The loop appends four paths to the configured command, in this order:

1. Prompt file.
2. JSON schema file.
3. Reply file.
4. Usage file.

Read them from the last four arguments. The command runs in the run's worktree without standard input and with `SHELL=bash`. Its output becomes the step transcript. Success requires exit status 0 and a reply file containing a JSON object that matches the supplied schema. Any other result is an execution failure.

The optional usage file is a JSON object with only these optional keys: `inputTokens`, `outputTokens` and `costUsd`. Each value must be a finite, non-negative number. Input counts all processed prompt tokens, cached or not; output counts all generated tokens, including reasoning. Omit values the harness does not report. A missing usage file means usage is unavailable; a malformed file, unknown key or invalid value stops the run.
