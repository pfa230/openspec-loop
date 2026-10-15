# openspec-loop

openspec-loop runs a proposed, committed OpenSpec change through proposal review, implementation, testing, integration, archival and delivery. Proposal authoring is attended; execution runs unattended until completion or a stop that requires intervention.

## Prerequisites

- Node 24 or later, on Linux or macOS
- OpenSpec 1.14.0 or later, as the `openspec` command on PATH
- Git
- Bash, the shell workers run model-written commands in
- A repository initialized with `openspec init` for the selected tools, with OpenSpec's skills and commands installed in the project
- The CLI for each configured agent harness: `claude`, `codex`, `agy` or `opencode`
- [ai-jail](https://github.com/akitaonrails/ai-jail), only for agents that use [`loop-jail`](#sandboxing)

## Installation

```sh
npm install -g openspec-loop
```

The package installs the `loop` command, four [agent adapters](#agents-and-adapters) and the [`loop-jail`](#sandboxing) sandbox wrapper.

For a system-wide Node installation whose npm global prefix belongs to root, configure a user-owned prefix with `npm config set prefix ~/.npm-global` and add `~/.npm-global/bin` to PATH. This allows installation without `sudo`.

To upgrade, run `npm update -g openspec-loop`, then run `loop setup` in each project and commit the refreshed skills.

## Project setup

In an OpenSpec-initialized repository:

1. Create and commit `openspec/loop.yaml` using the [configuration format](#configuration).
2. Add the worktrees directory and `openspec/loop.local.yaml` to `.gitignore`, for example:

   ```
   .worktrees/
   openspec/loop.local.yaml
   ```

   Store uncommitted configuration overrides in the main checkout's `openspec/loop.local.yaml`. Linked worktrees read these overrides automatically.

3. Install the bundled supervision and scoping skills for Claude Code and Codex, then commit the installed files:

   ```sh
   loop setup
   ```

   The command installs all bundled skills into `.claude/skills/` and `.agents/skills/` at the invoking Git checkout's root. It also works from a subdirectory and targets the invoking linked worktree. It accepts no options and needs no OpenSpec root, loop configuration or worker executables.

   Run the same command after each package upgrade and commit the refreshed files. Existing bundled skill directories are replaced completely: local edits are overwritten and obsolete files are removed. Unrelated skills, native OpenSpec skills and project configuration are preserved. Setup uses the executing package's files, independently of npm's current global prefix.

`loop setup` prints each installed skill directory and exits 0 on success. Extra arguments, invocation outside a Git working tree, or a file or symlink blocking a destination directory refuse with exit 2 before changing copies. Source or write failures exit 1 and identify the failing path; some copies may already have been refreshed. Correct the reported cause and rerun `loop setup` to complete the refresh.

The loop installs no Git hooks and requires no additional OpenSpec schema configuration.

## Configuration

The committed `openspec/loop.yaml` defines the default branch, worktree directory, agent commands, role assignments, attempt budgets, required checks and delivery mode. The default branch must be specified explicitly:

```yaml
defaultBranch: main
worktrees: .worktrees
agents:
  codex: [loop-codex, -s, read-only]
  opus: [loop-claude, --model, opus, --permission-mode, auto]
roles:
  proposalReviewer: codex
  planReviser: opus
  implementer: opus
  implementationReviewer: codex
attempts:
  proposalReview: 3
  implementation: 3
checks:
  - npm test
delivery: pr
```

- `worktrees` sets the parent directory for default-branch runs (`<worktrees>/<change>`) and scoping sessions (`<worktrees>/scope-<session>`). Relative paths resolve against the invoking checkout. Absolute paths are used as written. Changing this setting does not move existing worktrees. Ignore an in-checkout directory through `.gitignore` or, for one clone, `.git/info/exclude`; the loop does not edit ignore rules, and an unignored worktree makes the checkout dirty.
- `agents` maps configured aliases to agent commands. Each harness/model combination can have a separate alias, such as `opus` and `fable`, or `deepseek` and `mimo` on OpenCode. Progress lines identify agents by alias.
- `roles` assigns agents to proposal review, plan revision, implementation and implementation review. The plan reviser also applies minor plan fixes; the implementer also applies minor implementation fixes. One agent may fill several roles, but each turn uses a fresh context. `loop run`, `step` and `resume` can also name the four agents and write them to the run worktree's local file; see [Running a change](#running-a-change).
- `attempts.proposalReview` limits proposal reviews per advancement. `attempts.implementation` limits implementation attempts per advancement.
- `checks` lists required shell commands, executed with `sh -c` in the run's worktree. An empty list (`checks: []`) declares no required checks. Omitting the field causes refusal.
- `delivery` selects `local`, `pr` or `merge`; there is no default. `local` contacts no remote. `pr` and `merge` use the default branch's configured upstream remote and branch. Without an upstream, `loop run`, `loop resume`, `loop step` and `loop scope finish` refuse these modes. For example, configure an upstream with `git branch --set-upstream-to=origin/main main`.

### Local overrides

The ignored `openspec/loop.local.yaml` in the main checkout supplies uncommitted settings, such as machine-specific agent commands, across the clone's worktrees. A linked worktree can override them with its own local file.

At each layer, `defaultBranch`, `worktrees`, `checks` and `delivery` replace whole values; `agents`, `roles` and `attempts` replace individual entries. For example, a local file can add an agent and assign it a role:

```yaml
agents:
  deepseek: [loop-opencode, -m, deepseek/deepseek-v4]
roles:
  proposalReviewer: deepseek
```

Each `loop run`, `loop resume` and `loop step` rereads configuration in this order:

1. The invoking checkout's committed `openspec/loop.yaml`.
2. The main checkout's optional `openspec/loop.local.yaml`.
3. The invoking checkout's optional local file, if that checkout differs from the main checkout.

The main checkout is the clone's primary working tree, regardless of its current branch. Bare clones have no main checkout, so only the invoking checkout's files apply.

Git's directory and worktree records identify the main checkout. Commands refuse if those records do not identify an accessible working tree belonging to the clone. With a separated Git directory, direct invocation from the main checkout works; linked-worktree invocation refuses if Git reports the metadata directory instead of the main checkout.

Commands refuse missing committed configuration, unreadable files, invalid YAML, unknown keys, incorrect types and required fields missing after merging. Worktree overrides cannot hide an invalid main local file.

Commands that run workers also refuse undefined role aliases and unavailable agent commands. Commands without `/` resolve through PATH; commands containing `/` resolve against the invoking checkout, even when defined in the main local file. Relative `worktrees` paths also resolve against the invoking checkout.

Both `loop scope` commands use the same merge order and require structurally valid configuration. They neither resolve agent executables nor start workers.

### Agents and adapters

An agent's command is an adapter followed by arguments for its harness. The package ships four adapters, each verified with the harness version shown:

| Adapter | Harness | Read-only reviewer arguments | Editing plan reviser and implementer arguments |
|---|---|---|---|
| `loop-claude` | Claude Code 2.1.293 | `--permission-mode plan` | `--permission-mode auto` |
| `loop-codex` | Codex 0.160.0 | `-s read-only` | `-s workspace-write` |
| `loop-agy` | Antigravity 1.2.17 | none | `--dangerously-skip-permissions` |
| `loop-opencode` | OpenCode 1.18.34 | `--agent plan` | none |

Each adapter writes its harness's reported usage to the usage file as two token totals and any reported cost, even when the harness then fails. Input tokens are every prompt token the model processed, cached or not; output tokens are every token it generated, reasoning included. The harnesses count differently, so each adapter adds the native fields that make up those totals:

| Adapter | Input tokens | Output tokens | Cost |
|---|---|---|---|
| `loop-claude` | `input_tokens` + `cache_creation_input_tokens` + `cache_read_input_tokens` | `output_tokens` | Reported |
| `loop-codex` | `input_tokens`, which includes `cached_input_tokens` | `output_tokens`, which includes `reasoning_output_tokens` | Not reported |
| `loop-agy` | `input_tokens` + `cache_read_tokens` | `output_tokens`, which includes `thinking_tokens` | Not reported |
| `loop-opencode` | `input` + `cache.read` + `cache.write`, summed over the model steps of the turn | `output` + `reasoning`, summed likewise | Reported, summed likewise |

A total adds the fields the harness reported and is left out when it reported none of them. A negative or nonfinite field makes the total invalid, which stops the run as an execution failure. A cost is the harness's own figure. Claude Code reports list price even under a subscription, and OpenCode reports `0` for a model it has no price for. Claude Code and Antigravity use their last result summary, Codex its last completed turn, and OpenCode sums its model steps. Usage collection adds no command or API call, and never calculates an unreported cost. The harness's native counters, such as cache and reasoning breakdowns, stay in the step's transcript.

Add the model flag of the harness (`--model`, `-m`) to choose a model. Without restriction arguments, a harness runs with its own defaults; headless Claude Code and Codex cannot edit files by default.

The loop runs every worker with `SHELL` set to `bash`, because models write bash-shaped commands. Claude Code and OpenCode run commands in the shell `SHELL` names, but a harness's own setting takes precedence: Claude Code's `CLAUDE_CODE_SHELL` and OpenCode's `shell` configuration. Codex uses the account's login shell and ignores `SHELL`, and Antigravity ignores `SHELL` and uses bash.

Claude Code's auto mode needs a model and account that support it. Without it, Claude Code starts in its default mode and denies the commands an implementer needs to run, such as the checks. In auto mode, a classifier judges every edit inside a `.git` directory and may refuse one, so an editing Claude agent whose `worktrees` directory lies inside the repository's Git directory can be refused edits there. `--permission-mode bypassPermissions` approves them all. To restrict an agent's access, run it under [`loop-jail`](#sandboxing).

`loop-opencode` starts one local OpenCode server in the worktree and offers the model a `loop_reply` tool whose arguments are the supplied schema's properties. The tool lives in a temporary configuration directory that the adapter passes through `OPENCODE_CONFIG_DIR` and removes when the worker ends; OpenCode adds it to the configuration, plugins and server authentication it already loads, and no configuration file changes. The adapter does not force a tool choice, so providers that accept only automatic tool choice, such as Meta's Muse Spark, can reply. Cut reports and other prose stay in the transcript; only the arguments of the root session's last completed `loop_reply` call supply the reply, and the loop's reply validation checks them against the schema. The tool rejects a call that omits a required top-level property with an error naming the missing properties; that call does not supply the reply, and the model can call the tool again within its turn. Text containing JSON cannot replace a missing call. Because OpenCode reads a single `OPENCODE_CONFIG_DIR`, the adapter refuses to start when one is already set. API/session failures and unexpected server exits fail the step with any reported usage preserved, and the adapter closes its event subscription and stops its server before exiting.

The adapter explicitly disables HTTP response-header and response-body inactivity timeouts for its local requests and event subscription. A long prompt or quiet stream can wait until completion without inheriting Node's HTTP deadlines. Stop and interruption still cancel pending requests and stop the owned server; the startup readiness and forced-shutdown bounds remain in place. Provider or server limits are independent of this client policy.

Failure diagnostics stay in the worker's existing transcript. HTTP failures identify the method, API path and request or response-read operation; the transcript retains error names, codes, cause chains and available stacks before cleanup. It includes the originating transport reason behind generic messages such as `fetch failed` or `terminated`, without dumping request headers or prompt bodies. Reported usage is preserved when the worker fails.

Supported OpenCode arguments are `-m`/`--model`, `--agent`, `--variant`, `--auto` and `--pure`, including equals/value forms and explicit boolean false or `--no-auto`/`--no-pure`. Pure mode from the environment is preserved and still loads the reply tool. Other run arguments, including `--attach` (even localhost), session continuation, file attachments and `--dir`, fail by name before OpenCode starts. Permission requests in root and delegated sessions are rejected by default; explicit `--auto` approves requested permissions once while configured denies remain in force. Questions and plan-mode transitions remain denied as in the headless CLI. With `--agent plan`, OpenCode rejects reads outside the repository without asking. A model that ends its turn without calling `loop_reply` fails the step; an explicit `loop resume` runs it again.

#### Sandboxing

`loop-jail` runs a worker command under ai-jail. Prepend it to an agent's command:

```yaml
agents:
  deepseek: [loop-jail, loop-opencode, -m, deepseek/deepseek-v4, --auto]
  opus: [loop-jail, loop-claude, --model, opus, --permission-mode, bypassPermissions]
  codex: [loop-jail, loop-codex, -s, danger-full-access]
```

Run Codex with `-s danger-full-access` under `loop-jail`, as reviewer and editor alike. Its own sandbox is bubblewrap, which cannot create a user namespace inside the jail on hosts that restrict unprivileged user namespaces, such as Ubuntu 24.04 and later: every command fails with `bwrap: No permissions to create a new namespace`. The jail is then the boundary, so a jailed Codex reviewer can write the worktree.

Inside the jail, the worker can write only the worktree, a private `/tmp` and home directory discarded when it ends, and its harness's credential file. `TMPDIR` inside the jail is `/tmp`, whatever the caller's. It keeps network access, so the checks, `openspec`, Git reads and a headless browser work. The repository's Git directory and the worktree's `.git` file are read-only: `git status`, `git diff` and `git log` work, and writes to hooks, configuration, the index and the worktree's metadata fail. The wrapper has the adapter write its reply and usage to a temporary host directory, outside the read-only Git directory, and copies them to the loop's paths when the adapter exits, whatever its status. It makes the wrapped command, its harness and `openspec` runnable by mapping read-only the directory of each symlink hop and the final file's directory, or its npm package directory. The wrapper exits with the wrapped command's status; without `ai-jail` on PATH, the worker fails with an error naming it.

For the shipped adapters, the wrapper shares these files from the home directory. Everything else the harness writes is discarded when the worker ends.

| Adapter | Writable | Read-only |
|---|---|---|
| `loop-claude` | `~/.claude/.credentials.json` | `~/.claude/settings.json`, `~/.claude/CLAUDE.md` |
| `loop-codex` | `~/.codex/auth.json` | `~/.codex/config.toml` |
| `loop-agy` | `~/.gemini/antigravity-cli/antigravity-oauth-token` | `~/.gemini/antigravity-cli/settings.json` |
| `loop-opencode` | `~/.local/share/opencode/auth.json` | `~/.config/opencode` |

Plugins, MCP logins and session history kept elsewhere in the harness's state directory are absent inside the jail. The wrapper uses each harness's default locations: a harness whose state moves by environment, such as `CLAUDE_CONFIG_DIR`, `CODEX_HOME` or `XDG_DATA_HOME`, starts unauthenticated and fails the step. Other commands get only the Git metadata and executable maps.

To extend the jail, edit ai-jail's global configuration, `~/.ai-jail`. Its top-level keys apply to every command, so put what every worker needs there, such as a toolchain under the home directory and its build variables. For example, to let every adapter build a Rust project, with `CARGO_TARGET_DIR` set to `~/.cache/cargo-target` in the host's environment:

```toml
# ~/.ai-jail
ro_maps = ["~/.cargo/bin", "~/.rustup"]
rw_maps = ["~/.cargo/registry", "~/.cache/cargo-target"]
env_pass = ["CARGO_TARGET_DIR"]
```

Map the registry writable rather than as an overlay, since ai-jail keeps an overlay's upper layer in the worktree. Keep a `[commands.<adapter>]` table for what one harness alone needs, for example `[commands.loop-opencode]` with `env_pass` to pass a provider key. The system's `node` and `git` are already visible. The wrapper has no options of its own.

Headless Chrome aborts inside the jail unless started with `--no-sandbox`. Projects that drive a browser should state the flag in their agent instructions.

The jail prevents accidents, not deliberate sabotage:

- Credentials stay readable to the model. The harness calls its provider from the process that runs the model's commands, so its credential file and environment are readable inside the jail, and the network is open.
- The loop's own commands run on the host. Required checks run code the implementer wrote, and the loop's commit runs a hook the worker edited when the repository's `core.hooksPath` points inside the worktree.

`loop-jail` is verified with ai-jail 2.2.0 on Linux.

#### Custom adapters

Additional tools require an adapter that implements the worker interface. The loop appends four paths to the configured agent arguments, in order: prompt file, JSON schema file, reply file and usage file. Adapters must read these paths from the last four arguments.

The command runs in the run's worktree without standard input and with `SHELL` set to `bash`. Its output becomes the step transcript. Success requires exit status 0 and a reply file containing a JSON object that matches the supplied schema. Any other outcome stops the run as an execution failure.

The command may also write what its harness reported spending to the usage file, as a JSON object with three optional keys, each a finite non-negative number: `inputTokens`, every prompt token the model processed, cached or not; `outputTokens`, every token it generated, reasoning included; and `costUsd`, a cost in US dollars. Without a usage file, the step's usage shows as unavailable. A usage file that is not such an object, including any other key or a negative or nonfinite value, stops the run as an execution failure.

## Scoping sessions

The `openspec-scope` skill prepares proposals in an attended session. Invoke it as `/openspec-scope` in Claude Code or `$openspec-scope` in Codex.

The skill follows the repository's issue-listing workflow, recommends an order and waits for the user to select issues. It uses native OpenSpec proposing, requests material decisions, records routine defaults in the design and trims each proposal to one implementable change. Each proposal receives a separate artifact-only commit.

Explicit invocation authorizes follow-up issues for requested work trimmed from a proposal. Each follow-up links the source issue and names the OpenSpec change; the proposal links back from its non-goals. Source issues remain open until implementation.

The session commands can also be invoked directly. Neither accepts options:

| Command | What it does | Exit status |
|---|---|---|
| `loop scope start <session>` | Creates branch `scope/<session>` and a separate worktree from the committed local default branch, without fetching or changing that branch. Prints the worktree, branch and finish command. | 0 created, 2 refused |
| `loop scope finish <session>` | Rebases the clean session onto the current base, then delivers its committed proposals using `delivery`. Retains the branch and worktree. | 0 delivered, 1 integration/publication failed, 2 refused |

Git validates the generated branch name; no separate naming format is imposed. Existing branch or path collisions refuse without replacement and identify a registered checkout when one exists. Finish discovers the checkout through Git's worktree list. If it cannot find one, use `git worktree list` to locate a detached manual rebase, complete or abort it, or restore the session checkout before retrying.

Run start and finish from the same invoking checkout to retain its configuration and ignored local overrides. The session checkout inherits shared main-checkout settings through configuration reading, but does not receive a copy of the invoking checkout's `openspec/loop.local.yaml`. Use the reported session worktree explicitly as the working directory for native proposing, every OpenSpec artifact command and each proposal commit. Check the root from `openspec list --json` and the paths from native OpenSpec instructions before writing or staging: they must resolve inside that worktree. Follow the selected OpenSpec store's instructions if the project uses a store. Run scope commands and proposal commits with permission to write the shared Git directory; in Codex, request escalated permissions as with the supervision skill. Do not author in the default checkout when a sandbox refuses Git writes.

Native proposing may stop for review. Inspect its artifacts and request the next action explicitly before the attended workflow continues. Record `Source issue: <URL>` in each proposal and decisions/defaults in `design.md`; commit only `openspec/changes/<change>/`, for example `docs(scope): propose <change> (relates to #14)`, without closing keywords. Interrupted drafting resumes in the same worktree: inspect its files and Git history, retain finished proposal commits, and continue the draft. Finish refuses any uncommitted tracked or untracked work, including an unfinished proposal, with exit 2. Complete the draft or deliberately move it elsewhere first; finish does not commit, stash or remove it.

Session delivery differs from run delivery:

| Mode | Base and delivery |
|---|---|
| `local` | Rebase onto the current local default branch, then fast-forward it without remote contact. Local **run** delivery instead leaves the default branch untouched. |
| `pr` | Fetch and rebase onto the default branch's configured upstream, push the session branch without force, then find or create one PR against that upstream branch/repository. The local default branch stays unchanged. New PRs use `gh pr create --fill`, preserving issue-bearing proposal commit subjects. |
| `merge` | Fetch and safely synchronize the local default branch with its upstream, rebase onto it, push the session tip to the upstream default branch, then fast-forward the local default branch. |

Default updates require clean tracked files in any checkout holding that branch, preserve unrelated untracked files and stop if Git would overwrite a file, including an ignored one. An ahead or diverged local default in `merge`, a dirty default holder, a conflict, a rejected push or a failed fast-forward exits 1 with attended recovery. Syntax/configuration problems, invalid names, collisions, missing session checkouts, uncommitted session work and a missing required upstream refuse with exit 2. A conflicting finish rebase is aborted; reconcile manually in the session worktree before retrying. No automatic merge fallback, force push, implementation, enrollment or archival occurs.

Retry finish from the original invoking checkout after resolving its reported cause. If a merge push succeeded before the local update failed, retry can complete the safe local update. An open PR is reused only after the retry's non-force push succeeds. If rebasing onto a moved base rewrites an already-published session branch, Git can reject that push. In the session worktree, fetch the upstream remote's session branch and current base, merge the published session history into the rebased branch, then merge the current base if it is not already an ancestor. For example, substituting the actual upstream remote and branch names:

```sh
git fetch origin scope/planning main
git merge --no-edit origin/scope/planning
git merge --no-edit origin/main       # if not already an ancestor of HEAD
```

Resolve and commit any conflicts before retrying `loop scope finish planning` from the original invoking checkout. Both the published tip and current base must be ancestors of the session tip; finish then avoids another rebase and can push without force. Resetting only to the published tip would repeat the rebase and rejection.

After proposals land, explicitly run `loop run <change>` or `loop step <change>` from the default branch. In `pr` mode, merge the proposal PR there first. Enrolling from the multi-proposal session branch includes sibling proposal commits in the selected change's patch. Finishing scoping leaves proposals unarchived and unenrolled, and keeps the session checkout for inspection or manual Git cleanup.

## Running a change

Create and commit a proposal with native OpenSpec proposing: `/opsx:propose` in Claude Code or `$openspec-propose` in Codex. The proposal must be committed on the branch used by the run. The checkout where `loop run` or an enrolling `loop step` is invoked determines that branch:

- **On the default branch.** Commit the proposal on the default branch and run `loop run <change>` there. The loop creates branch `loop/<change>` from that commit in a worktree under `worktrees` and leaves the invoking checkout's files and index untouched.
- **On a branch of its own.** Create a worktree on a new branch, propose and commit there, and run `loop run <change>` in that worktree. The run works in that worktree, which must have no uncommitted changes.

The commands work from any checkout of the repository:

| Command | What it does | Exit status |
|---|---|---|
| `loop run <change> [<agents>]` | Starts a run and advances it in the foreground, printing a progress line as each step starts and ends, then a report. | 0 completed, 1 stopped, 2 refused |
| `loop step <change> [<agents>]` | Enrolls a new run or continues an existing one, returning after the first pending stage succeeds with its normal review/revision cycle. Reports the next stage and how to continue. | 0 boundary or completed, 1 stopped, 2 refused |
| `loop resume <change> [<agents>] [--attempts <n>] [--implement]` | Continues a run that is between stages, stopped or interrupted, from its first incomplete stage, with a fresh attempt budget: the configured one, or `<n>` when given. `--implement` first makes implementation and every later stage incomplete, so the implementer implements the plan as it stands; it is refused once the change is archived. | 0 completed, 1 stopped, 2 refused |
| `loop stop <change>` | Ends the current step at once; the run reports how to resume. Ctrl-C and closing the terminal do the same. | 0, 2 if there is no run |
| `loop status <change>` | Shows the run's state, branch, stages and locations. | 0, 2 if there is no run |

`run`, `step` and `resume` accept four agent aliases after the change name, in role order: proposal reviewer, plan reviser, implementer, implementation reviewer. For example, `loop run <change> claude codex muse deepseek`. Each must be an agent the configuration defines. The command runs with them and writes them as the `roles` of `openspec/loop.local.yaml` in the run's worktree, keeping the file's other content, so later commands invoked from that worktree use them too.

To inspect an approved plan and then a reviewed implementation, use the same committed change with:

```sh
loop step <change>     # proposal review, including revisions and minor fixes
loop status <change>   # between stages; implementation is next
loop step <change>     # implementation, including checks, review and revisions
loop resume <change>   # continue through integration, archive and delivery
```

Alternatively, continue with `loop step <change>` through integration, archival and delivery. Each successful boundary returns control with exit status 0 while the run remains incomplete; its report and `status` name the next stage and continuation commands. Delivery reports the whole run complete. `run` still refuses an already-enrolled change. Attempt overrides and reopening implementation remain options of `resume` only.

Each `step` call receives fresh configured attempt budgets. If implementation returns the plan for revision or integration returns findings to implementation, the same call follows that handoff and returns when the first stage succeeds; the next stage can therefore be an earlier one. Failures and decision questions stop with the usual cause and recovery. After resolving the stop, use `step` or `resume` explicitly to continue.

When a worker step ends, its progress line names the agent and the step's input tokens, output tokens and cost in the same form for every harness, such as `(claude; input 332,936, output 2,234, cost $0.57)` or `(codex; input 16,641, output 59, cost unavailable)`. Cost is rounded to cents, so a cost below half a cent shows as `$0.00`. A value the harness did not report reads `unavailable`, never zero; an explicitly reported zero stays zero, and `usage unavailable` means it reported nothing. The native counters stay in the step's transcript.

The report at the end of `loop run`, `loop resume` and `loop step`, whether the run completed, stopped or returned control between stages, totals the usage by role over every worker step the run has had, across every advancement:

```
Usage by role:
  proposalReviewer: 2 steps; input 33,282, output 118, cost unavailable
  implementer: 3 steps, 1 without usage; input 491,414, output 5,120, cost $1.20, 1 step without cost
```

Input tokens, output tokens and cost are each summed over the steps that reported them, and read `unavailable` when none did. `without usage` counts the steps with no valid usage: a missing or empty usage file, such as after a turn stopped before its harness reported, or a malformed one, which also stopped the run. When only some of a role's steps reported a cost, the line says how many did not.

A run accepts one advancement at a time, shared by `run`, `resume` and `step`. If the process advancing it dies, `loop resume` takes the run over and redoes the step that was in progress. A process killed with SIGKILL, for example by `kill -9` or the OOM killer, can leave its step running; `loop resume` then refuses and names the step's process group. End it with `kill -- -<group>` or wait for it to exit, then resume. If the group it names is not the run's, because its ID was reused after the step ended, check it with `pgrep -l -g <group>` and set `stepGroup` to `null` in the run directory's `state.json`.

Each run keeps its state in the repository's Git directory, at `.git/openspec-loop/<change>/` in a regular clone: `state.json` and the transcripts of every step under `transcripts/`. A run started on the default branch works in its worktree under `worktrees`. The report and `loop status` print the exact paths. To discard a run and start over, note the `Worktree` and `Run directory` lines of `loop status <change>`, then:

```sh
git worktree remove --force "<worktree>"   # only for a run started on the default branch
git branch -D loop/<change>                # likewise
rm -rf "<run directory>"
```

### Proposal review

Proposal review covers the change's proposal, design, spec deltas and tasks.

- **The review.** The proposal reviewer judges whether the whole plan can be implemented and verified as one change without further decisions, whether it keeps the decisions recorded in its design, and whether it follows the rules the repository's instructions for agents, such as `AGENTS.md` or `CLAUDE.md`, set for what a change contains. Rules for how an agent works or reports are not review criteria. It reports each problem as blocking or minor. A minor finding is a local fix, such as a typo or a wrong path, that cannot change behavior or a recorded decision.
- **The verdict.** It follows from the findings: any blocking finding is `REVISE`; otherwise the verdict is `APPROVE`. Each review's verdict and findings are kept as `NNN-proposal-review.verdict.json` in the transcripts.
- **Revision.** On `REVISE`, the plan reviser revises the plan in a fresh context, the loop commits the change directory on the run's branch, and the plan is reviewed again.
- **Minor fixes.** On `APPROVE` with minor findings, the plan reviser applies them, the loop commits them, and ordinary advancement starts implementation without another review; `step` returns at the proposal-review boundary.
- **Approval.** Approval covers the resulting plan. Manual plan edits do not invalidate it automatically or change the resume point; those edits require manual verification. To reopen completed implementation for an edited plan, commit the edit on the run's branch and run `loop resume <change> --implement`. The implementer continues from the branch's existing work, followed by checks, implementation review, integration, archival and delivery. Proposal review is not repeated. The option is refused after archival.
- **Decisions.** When a finding needs a decision the plan does not record, the run stops with the reviewer's question before revising anything. Answer it by recording the decision in the design in the run's worktree, committing it on the run's branch, and running `loop resume <change>`. The report names the worktree and the branch.
- **Attempts.** Each review uses one attempt. When the last allowed review is `REVISE`, the run stops after that review's revision. Every resume starts a fresh budget; `loop resume <change> --attempts 1` gives exactly one more review.

A worker that exits nonzero, is killed, or writes a missing or malformed reply stops the run as an execution failure; the report names its transcript and reply.

### Implementation

Implementation runs in attempts after proposal approval. Ordinary advancement starts it automatically; stage-bounded advancement starts it on the next `loop step` invocation. Each attempt includes:

- **The implementer turn.** The implementer works in a fresh context from OpenSpec's own apply instructions for the change, including any `operations.apply.guidance` in `openspec/config.yaml`, and from the findings of the last attempt. It ticks task boxes as it goes. The loop then commits everything in the run's worktree on the run's branch as `<change>: implement`, `<change>: revise implementation` or `<change>: apply minor implementation fixes`.
- **The checks.** Every required check runs, in order, even after one fails. A failed check is not a failure of the run: its exit status and the end of its output become a finding for the next attempt, kept as `NNN-checks.findings.json` in the transcripts, and review waits until the checks pass. The implementer fixes only failures the change caused, so a check that already fails on the base fails until attempts run out.
- **The review.** The implementation reviewer judges whether the patch implements the whole approved plan, stays within it, keeps the decisions in the design and follows the repository's rules for what a change contains, as in proposal review. The patch is the change's work outside `openspec/changes/<change>/`: plan revisions, minor plan fixes and decisions recorded on the run's branch are not part of it. The verdict follows from the findings as in proposal review, and is kept as `NNN-implementation-review.verdict.json` with the base and candidate commits it covers. `REVISE` starts the next attempt on the review's findings.
- **Minor fixes.** On `APPROVE` with minor findings, the implementer applies them, the checks run again, and the stage completes without another review. If a check fails after the fixes, the approval lapses and the next attempt runs a full round.
- **Plan problems.** When the implementer reports that the plan needs a change, the plan reviser revises the plan and it returns to proposal review. Implementation continues after the plan is approved again, with the same attempt count. The implementer may tick task boxes but not change the plan itself: a turn that edits the plan otherwise stops the run, and the report names the turn's commit. Revert that commit's plan changes on the run's branch and resume. The loop compares the plan before and after each turn, so a turn interrupted before it ends is not checked.
- **Decisions.** A review finding that needs a decision the plan does not record stops the run, as in proposal review. Record the decision in the design, commit it, and resume; the plan is reviewed again first.
- **Attempts.** When the last allowed attempt ends with failed checks or `REVISE`, the run stops and names the findings. Resume starts with an implementer turn on those findings and a fresh budget, or `--attempts <n>`. A resume after a stop in the middle of an attempt also starts with an implementer turn, so a stop during checks or review costs one extra turn.

Uncommitted edits outside the change directory in a stopped run's worktree are included in the next implementer commit and become part of the patch. They are checked, and reviewed unless that turn applies minor fixes, which complete without another review. Runs created when proposal review and implementation were fixture stages may skip them on resume. Discard and restart such runs using the procedure above.

### Integration

Once implementation completes, the loop integrates the change with the current base: the remote's default branch in `pr` mode, and the local default branch in `local` and `merge` modes.

- **Bringing the base in.** Every delivery mode rebases the run's branch onto the base, keeping its history linear when the rebase is clean. When the rebase conflicts, the loop abandons it and merges instead. A rebase rewrites the branch's commits, so review records and stop reports from before it name commits that are no longer on the branch; Git keeps them until it prunes unreachable objects, so `git diff` against them still works. The loop overrides `rebase.updateRefs` and `merge.ff` from the existing Git configuration for these commands without changing it.
- **Conflicts.** A conflicted merge stays in progress in the run's worktree, and the next attempt's implementer gets the conflicted files as a finding. The loop commits the resolution as the merge commit, with Git's message, and the checks and review run as in any attempt.
- **A changed patch.** When integration changes the change's patch, the same patch the review judged, compared without context lines or line numbers, for example because the base already holds part of the change, the result goes back to the implementer the same way and is checked and reviewed again.
- **Checks.** The required checks run on the integrated result, and a failure goes back to the implementer as a finding. Each return to the implementer uses an implementation attempt.
- **The default branch in `merge` mode.** The loop first fetches the upstream and brings the local default branch level with it. When it is behind, the loop fast-forwards it in the checkout that holds it, and stops if that checkout has uncommitted changes to tracked files; untracked files do not count. When the local default branch is ahead of its upstream, or the two have diverged, the run stops: push or remove the extra commits, or reconcile the branches, then run `loop resume <change>`. A proposal commit left unpushed on the default branch stops the run this way, so in `merge` mode push the proposal before `loop run`, or propose on a branch of its own.
- **Unpushed commits in `pr` mode.** The base is the remote's branch, so unpushed commits on the local default branch become part of the pull request. Push them before enrollment to keep them out of the change's pull request.
- **Already-pushed branches in `pr` mode.** Enrollment accepts an already-published branch. The same rebase rule applies, so its later non-force delivery push can be rejected.
- **Interruptions.** A rebase or merge that a stop or crash left in progress before its conflict reached the implementer is aborted when integration runs again.

### Archive

After integration, the loop archives the change by running `openspec archive <change> --yes` in the run's worktree. OpenSpec validates the change, applies its spec deltas to the main specs under `openspec/specs/`, and moves the change to `openspec/changes/archive/<date>-<change>/`. The loop commits the result on the run's branch as `<change>: archive`. OpenSpec's output is kept as `NNN-archive.log` in the transcripts.

When OpenSpec refuses, for example because a spec delta fails validation or names a requirement the main spec lacks, the run stops at archive and commits nothing; the report names the transcript. Fix the change in the run's worktree, commit the fix on the run's branch, and run `loop resume <change>`. Resume runs the archive again without reviewing the fix.

If a run is stopped or dies after OpenSpec archived the change, resume sees that the change has left `openspec/changes/<change>/`, does not run OpenSpec again, and commits the archive if the loop had not yet. Only an interruption inside `openspec archive` itself can leave its work half done, with the change still in place; resume then fails with OpenSpec's message. Undo the partial archive in the run's worktree with `git restore --source=HEAD --staged --worktree openspec` and `git clean -fd openspec/changes/archive`, then resume.

### Delivery

The last stage delivers the archived change as `delivery` says. Every action outside the run's worktree gets its own progress line, and the output of each fetch, push and `gh` command is kept in the transcripts.

- **`local`.** Nothing is pushed and the default branch is untouched. The run ends with the archived change committed on the run's branch.
- **`pr`.** Only at delivery, after integration and archival, the loop pushes the run's branch to the upstream remote without force or setting an upstream for it, and opens a pull request with `gh` against the upstream branch, on the upstream remote's repository. The pull request is titled with the change's name, and its body is the archived proposal. The local default branch is untouched. A rejected push stops delivery with Git's message and transcript before any pull request command. `gh` must be installed and logged in; if it is missing or fails, the run stops at delivery, and `loop resume <change>` continues after the push it already made.
- **`merge`.** The loop first checks that the checkout holding the default branch has no uncommitted changes to tracked files and that the run's branch contains the default branch. It then pushes the run's branch tip to the upstream branch and only then fast-forwards the local default branch to it, so a rejected push leaves the local default branch where it was. The fast-forward moves the files of the checkout that holds the default branch, and stops rather than overwrite a file there, ignored files included.

When delivery stops, the report says what to fix:

- **A dirty checkout:** commit or discard its changes, then resume.
- **Commits on the default branch that the run's branch lacks, or a rejected push because the upstream moved:** bring them into the run's branch in its worktree, then resume.
- **A rejected PR branch push after rebasing:** reconcile the run's branch with its published history in the run's worktree, then run `loop resume <change>` or `loop step <change>`. Continuation retries delivery without repeating completed integration, checks, review or archival; the reconciliation requires manual verification.
- **A failed fast-forward:** clear what Git names in the checkout, such as a file in the way, then resume.

Resume after an interrupted delivery repeats its steps safely. Git does nothing for a push or a fast-forward whose commit is already there, and in `pr` mode the loop reports a pull request that is already open for the run's branch against the upstream branch instead of opening another.

## Supervising from Claude Code or Codex

The `openspec-loop` skill installed during [project setup](#project-setup) allows a Claude Code or Codex session to supervise a run. Requests to run, stop or resume a change use the documented `loop` commands. The skill relays progress lines as they appear and displays the final report unchanged.

For a stopped run, the skill diagnoses the cause from the report, transcripts, effective agent command and findings. Execution-failure diagnosis traces the failed operation and, when necessary, reads the invoked adapter and its helper to distinguish a harness failure from reply rejection. The diagnosis describes committed and uncommitted work, completed and pending validation, and uncertainty before recommending recovery. Investigation is read-only; repairs and continuation require the user's agreement.

`loop` writes the repository's Git directory and starts workers, so supervision commands run outside the session's sandbox. Codex requests escalated permissions for each `loop` command.

## Development

```sh
npm ci      # install the pinned dev dependencies
npm test    # build and run the tests; this is the project's only check
```

The loop's contract is `openspec/specs/loop-workflow/spec.md`.

### Releasing

Release as the Releasing section of `AGENTS.md` describes.
