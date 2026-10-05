# openspec-loop

openspec-loop takes an OpenSpec change you proposed and committed, and runs it unattended to a reviewed, implemented, tested, archived and delivered result. You attend the proposal; the loop handles everything after it.

The loop is under construction. Its contract is [`openspec/specs/loop-workflow/spec.md`](openspec/specs/loop-workflow/spec.md), and the build steps are tracked as GitHub issues.

## Prerequisites

- Node 24 or later, on Linux or macOS (Windows is tracked in #16)
- OpenSpec 1.14.0 or later, as the `openspec` command on PATH
- Git
- The CLI of each harness your agents use: `claude`, `codex`, `agy` or `opencode`

## Configuration

Commit `openspec/loop.yaml` in the repository. It names the default branch, which the loop does not detect, the directory for the worktrees the loop creates, the agents that do the work, the role each agent fills, and the attempt budgets:

```yaml
defaultBranch: main
worktrees: .worktrees
agents:
  gpt: [loop-codex, -m, gpt-5.5, -s, read-only]
  opus: [loop-claude, --model, opus, --permission-mode, acceptEdits]
roles:
  proposalReviewer: gpt
  planReviser: opus
attempts:
  proposalReview: 3
```

- `worktrees` is the directory where a run started on the default branch gets its worktree, at `<worktrees>/<change>`. A relative path is relative to the repository's main worktree, whichever checkout you run from; an absolute path is used as written. A run keeps the worktree it was created with, so changing `worktrees` affects only new runs. The loop never edits ignore rules: when the directory lies inside a checkout, add it to `.gitignore`, or to `.git/info/exclude` for one clone only, because an unignored worktree makes that checkout dirty.
- `agents` maps an alias of your choice to the command that runs that agent. Define one agent per harness and model you use, such as `opus` and `fable`, or `deepseek` and `mimo` on OpenCode. Progress lines name agents by alias.
- `roles` assigns an agent to each role. The proposal reviewer judges the plan; the plan reviser revises it and applies minor plan fixes. One agent may fill both roles: every turn runs in a fresh context.
- `attempts.proposalReview` bounds how many proposal reviews one advancement runs.

Put settings you do not want to commit, such as your own agents, in `openspec/loop.local.yaml` beside it, and add that file to `.gitignore`. A value set there replaces the committed one: `defaultBranch` and `worktrees` as a whole, and `agents`, `roles` and `attempts` entry by entry, so a local file can add one agent and point one role at it:

```yaml
agents:
  deepseek: [loop-opencode, -m, deepseek/deepseek-v4]
roles:
  proposalReviewer: deepseek
```

The loop reads both files from the checkout where you give `loop run` or `loop resume`, every time you give either. A missing `openspec/loop.yaml`, invalid YAML, an unknown key or a wrong type in either file, or a required field missing from both, refuses the command. So does a role whose alias is undefined or whose agent's command cannot be found: a command without `/` is looked up on PATH, and one with `/` is taken relative to the checkout.

### Agents and adapters

An agent's command is an adapter followed by arguments for its harness. The package ships four adapters, each verified with the harness version shown:

| Adapter | Harness | Read-only reviewer arguments | Editing reviser arguments |
|---|---|---|---|
| `loop-claude` | Claude Code 2.1.289 | `--permission-mode plan` | `--permission-mode acceptEdits` |
| `loop-codex` | Codex 0.160.0 | `-s read-only` | `-s workspace-write` |
| `loop-agy` | Antigravity 1.2.12 | none | `--dangerously-skip-permissions` |
| `loop-opencode` | OpenCode 1.18.34 | `--agent plan` | none |

Add the model flag of the harness (`--model`, `-m`) to choose a model. Without restriction arguments, a harness runs with its own defaults; headless Claude Code and Codex cannot edit files by default.

Claude Code refuses to edit any path inside a `.git` directory without `bypassPermissions`, even with `--permission-mode acceptEdits`. A `worktrees` directory inside the repository's Git directory therefore needs `bypassPermissions` for an editing Claude agent. Run such an agent inside a sandbox if you want to limit what it can do: put the sandbox command first, for example `[ai-jail, --exec, ..., loop-claude, ...]`.

OpenCode has no way to enforce a reply schema, so `loop-opencode` asks for bare JSON and fails the step when the final message is anything else.

To use another tool, write your own adapter. The loop runs the agent's command with three paths appended: a prompt file, a JSON schema file and a reply file. The command runs in the run's worktree with no input, and its output becomes the step's transcript. It must exit 0 after writing a JSON object that matches the schema to the reply file; anything else stops the run as an execution failure.

## Running a change

Propose the change with native `/opsx:propose` and commit it. The proposal must be committed on the branch the run works on, which you choose by where you give `loop run`:

- **On the default branch.** Commit the proposal on the default branch and run `loop run <change>` there. The loop creates branch `loop/<change>` from that commit in a worktree under `worktrees` and leaves your checkout's files and index untouched.
- **On a branch of its own.** Create a worktree on a new branch, propose and commit there, and run `loop run <change>` in that worktree. The run works in that worktree, which must have no uncommitted changes.

The commands work from any checkout of the repository:

| Command | What it does | Exit status |
|---|---|---|
| `loop run <change>` | Starts a run and advances it in the foreground, printing a progress line as each step starts and ends, then a report. | 0 completed, 1 stopped, 2 refused |
| `loop resume <change> [--attempts <n>]` | Continues a stopped or interrupted run from its first incomplete stage, with a fresh attempt budget: the configured one, or `<n>` when given. | 0 completed, 1 stopped, 2 refused |
| `loop stop <change>` | Ends the current step at once; the run reports how to resume. Ctrl-C and closing the terminal do the same. | 0, 2 if there is no run |
| `loop status <change>` | Shows the run's state, branch, stages and locations. | 0, 2 if there is no run |

A run accepts one advancement at a time. If the process advancing it dies, `loop resume` takes the run over and redoes the step that was in progress.

Each run keeps its state in the repository's Git directory, at `.git/openspec-loop/<change>/` in a regular clone: `state.json` and the transcripts of every step under `transcripts/`. A run started on the default branch works in its worktree under `worktrees`. The report and `loop status` print the exact paths. To discard a run and start over, note the `Worktree` and `Run directory` lines of `loop status <change>`, then:

```sh
git worktree remove --force <worktree>   # only for a run started on the default branch
git branch -D loop/<change>              # likewise
rm -rf <run directory>
```

### Proposal review

The first stage reviews the plan: the change's proposal, design, spec deltas and tasks.

- **The review.** The proposal reviewer judges whether the whole plan can be implemented and verified as one change without asking you, and whether it keeps the decisions recorded in its design. It reports each problem as blocking or minor. A minor finding is a local fix, such as a typo or a wrong path, that cannot change behavior or a recorded decision.
- **The verdict.** It follows from the findings: any blocking finding is `REVISE`; otherwise the verdict is `APPROVE`. Each review's verdict, findings and plan digest are kept as `NNN-proposal-review.verdict.json` in the transcripts.
- **Revision.** On `REVISE`, the plan reviser revises the plan in a fresh context, the loop commits the change directory on the run's branch, and the plan is reviewed again.
- **Minor fixes.** On `APPROVE` with minor findings, the plan reviser applies them, the loop commits them, and implementation starts without another review.
- **Approval.** It covers the plan as it then stands. Ticking a task box keeps it. Any other edit to the change directory voids it, and the next stage boundary or resume reviews the plan again.
- **Decisions.** When a finding needs a decision the plan does not record, the run stops with the reviewer's question before revising anything. Answer it by recording the decision in the design in the run's worktree, committing it on the run's branch, and running `loop resume <change>`. The report names the worktree and the branch.
- **Attempts.** Each review uses one attempt. When the last allowed review is `REVISE`, the run stops after that review's revision. Every resume starts a fresh budget; `loop resume <change> --attempts 1` gives exactly one more review.

A worker that exits nonzero, is killed, or writes a missing or malformed reply stops the run as an execution failure; the report names its transcript and reply. A run started before proposal review became real reviews its plan again when resumed.

### Fixture stages

Implementation, integration, archive and delivery do no real work yet. Until later build steps replace them, each runs a shell command from a fixture file named by `LOOP_FIXTURE`, and every progress line and report marks the outcome `fixture`:

```yaml
implementation: "sleep 20"
integration: "true"
archive: "true"
delivery: "true"
```

A command that exits 0 completes its stage; any other exit stops the run as an execution failure. `loop run` and `loop resume` refuse when `LOOP_FIXTURE` is unset or does not name every fixture stage.

## Development

```sh
npm ci      # install the pinned dev dependencies
npm test    # build and run the tests; this is the project's only check
```
