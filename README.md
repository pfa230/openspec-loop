# openspec-loop

openspec-loop takes an OpenSpec change you proposed and committed, and runs it unattended to a reviewed, implemented, tested, archived and delivered result. You attend the proposal; the loop handles everything after it.

The loop is under construction. Its contract is [`openspec/specs/loop-workflow/spec.md`](openspec/specs/loop-workflow/spec.md), and the build steps are tracked as GitHub issues.

## Prerequisites

- Node 24 or later, on Linux or macOS (Windows is tracked in #16)
- OpenSpec 1.14.0 or later, as the `openspec` command on PATH
- Git
- The CLI of each harness your agents use: `claude`, `codex`, `agy` or `opencode`

## Configuration

Commit `openspec/loop.yaml` in the repository. It names the default branch, which the loop does not detect, the directory for the worktrees the loop creates, the agents that do the work, the role each agent fills, the attempt budgets and the required checks:

```yaml
defaultBranch: main
worktrees: .worktrees
agents:
  gpt: [loop-codex, -m, gpt-5.5, -s, read-only]
  opus: [loop-claude, --model, opus, --permission-mode, acceptEdits]
roles:
  proposalReviewer: gpt
  planReviser: opus
  implementer: opus
  implementationReviewer: gpt
attempts:
  proposalReview: 3
  implementation: 3
checks:
  - npm test
```

- `worktrees` is the directory where a run started on the default branch gets its worktree, at `<worktrees>/<change>`. A relative path is relative to the checkout where you give `loop run`; an absolute path is used as written. A run keeps the worktree it was created with, so changing `worktrees` affects only new runs. The loop never edits ignore rules: when the directory lies inside a checkout, add it to `.gitignore`, or to `.git/info/exclude` for one clone only, because an unignored worktree makes that checkout dirty.
- `agents` maps an alias of your choice to the command that runs that agent. Define one agent per harness and model you use, such as `opus` and `fable`, or `deepseek` and `mimo` on OpenCode. Progress lines name agents by alias.
- `roles` assigns an agent to each role. The proposal reviewer judges the plan; the plan reviser revises it and applies minor plan fixes; the implementer implements the plan and applies minor implementation fixes; the implementation reviewer judges the patch. One agent may fill several roles: every turn runs in a fresh context.
- `attempts.proposalReview` bounds how many proposal reviews one advancement runs, and `attempts.implementation` how many implementation attempts.
- `checks` lists the required checks, each a shell command run with `sh -c` in the run's worktree. `checks: []` means the change has no required checks; leaving `checks` out refuses the run.

Put settings you do not want to commit, such as your own agents, in `openspec/loop.local.yaml` beside it, and add that file to `.gitignore`. A value set there replaces the committed one: `defaultBranch`, `worktrees` and `checks` as a whole, and `agents`, `roles` and `attempts` entry by entry, so a local file can add one agent and point one role at it:

```yaml
agents:
  deepseek: [loop-opencode, -m, deepseek/deepseek-v4]
roles:
  proposalReviewer: deepseek
```

The loop reads both files from the checkout where you give `loop run` or `loop resume`, every time you give either. A missing `openspec/loop.yaml`, invalid YAML, an unknown key or a wrong type in either file, or a required field missing from both, refuses the command. So does a role whose alias is undefined or whose agent's command cannot be found: a command without `/` is looked up on PATH, and one with `/` is taken relative to the checkout.

### Agents and adapters

An agent's command is an adapter followed by arguments for its harness. The package ships four adapters, each verified with the harness version shown:

| Adapter | Harness | Read-only reviewer arguments | Editing plan reviser and implementer arguments |
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
git worktree remove --force "<worktree>"   # only for a run started on the default branch
git branch -D loop/<change>                # likewise
rm -rf "<run directory>"
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

### Implementation

Once the plan is approved, the implementation stage runs without you, in attempts. Each attempt is one round:

- **The implementer turn.** The implementer works in a fresh context from OpenSpec's own apply instructions for the change, including any `operations.apply.guidance` in `openspec/config.yaml`, and from the findings of the last attempt. It ticks task boxes as it goes. The loop then commits everything in the run's worktree on the run's branch as `<change>: implement`, `<change>: revise implementation` or `<change>: apply minor implementation fixes`.
- **The checks.** Every required check runs, in order, even after one fails. A failed check is not a failure of the run: its exit status and the end of its output become a finding for the next attempt, kept as `NNN-checks.findings.json` in the transcripts, and review waits until the checks pass. The implementer fixes only failures the change caused, so a check that already fails on the base fails until attempts run out.
- **The review.** The implementation reviewer judges whether the patch implements the whole approved plan, stays within it and keeps the decisions in the design. The verdict follows from the findings as in proposal review, and is kept as `NNN-implementation-review.verdict.json` with the base and candidate commits it covers. `REVISE` starts the next attempt on the review's findings.
- **Minor fixes.** On `APPROVE` with minor findings, the implementer applies them, the checks run again, and the stage completes without another review. If a check fails after the fixes, the approval lapses and the next attempt runs a full round.
- **Plan problems.** When the implementer reports that the plan needs a change, or edits the plan beyond ticking boxes, the plan reviser revises it and the plan returns to proposal review. Implementation continues after the plan is approved again, with the same attempt count.
- **Decisions.** A review finding that needs a decision the plan does not record stops the run, as in proposal review. Record the decision in the design, commit it, and resume; the plan is reviewed again first.
- **Attempts.** When the last allowed attempt ends with failed checks or `REVISE`, the run stops and names the findings. Resume starts with an implementer turn on those findings and a fresh budget, or `--attempts <n>`. A resume after a stop in the middle of an attempt also starts with an implementer turn, so a stop during checks or review costs one extra turn.

Changes you leave uncommitted in the run's worktree while the run is stopped are committed with the next implementer turn and checked and reviewed as part of the patch. A run started before implementation became real treated it as a fixture and may skip it on resume: discard such a run as described above and start it again.

### Fixture stages

Integration, archive and delivery do no real work yet. Until later build steps replace them, each runs a shell command from a fixture file named by `LOOP_FIXTURE`, and every progress line and report marks the outcome `fixture`:

```yaml
integration: "sleep 20"
archive: "true"
delivery: "true"
```

A command that exits 0 completes its stage; any other exit stops the run as an execution failure. `loop run` and `loop resume` refuse when `LOOP_FIXTURE` is unset or does not name every fixture stage.

## Development

```sh
npm ci      # install the pinned dev dependencies
npm test    # build and run the tests; this is the project's only check
```
