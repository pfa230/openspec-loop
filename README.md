# openspec-loop

openspec-loop automates implementation, testing and review of changes planned with OpenSpec. A developer and agent prepare a batch of proposals together before starting the unattended runs.

## Why this workflow

An issue describes a problem, but often leaves questions about scope and behavior unanswered. If an agent makes those decisions on its own, the resulting code can pass review and still miss the intended behavior.

OpenSpec separates planning from implementation. During an attended planning session, the developer answers questions and works through design choices with the agent. The proposal, design, specifications and tasks record the agreed scope and give both implementation and review a common reference.

Once a batch of proposals is ready, openspec-loop handles implementation, checks and review without requiring the developer to supervise each agent turn. If review raises a question the plan does not answer, the run stops for a decision.

## How it works

1. **Prepare proposals.** Use `loop-scope` to work through selected issues. Resolve design questions, define each change's scope and commit the finished proposals separately.
2. **Choose a ready batch.** `loop-proposals` lists the proposals and recommends an order. Every change in a batch must be able to start from the current default branch, without depending on another unfinished change.
3. **Start the runs.** Invoke `loop-run` from the default branch with the selected change names. It starts a separate run and worktree for each, and reports their progress.
4. **Handle stops.** The supervisor investigates failures and can revise plans without changing recorded decisions. It asks for input when a decision remains open. One stopped run does not delay the others.

Each run follows the same stages:

```text
Proposal review -> Implementation, checks and review -> Integration -> Archive -> Delivery
```

The loop sends review findings back to the agent responsible for the work and limits the number of attempts. After implementation passes review, it integrates the patch with the current base branch and runs the checks again. Conflicts or changes to the reviewed patch require another implementation attempt. OpenSpec then updates the project's specifications and archives the change. Depending on configuration, the loop leaves the result on a local branch, opens a pull request, or pushes it to the default branch.

The loop decides which stage runs next and saves every worker's transcript. Its CLI runs in the foreground, so keep the process alive while it works. Saved state allows another session to inspect the run or resume it after a stop.

See [Workflow](docs/workflow.md) for proposing, batch dependencies and review rules.

## Choosing models

Each role has its own model assignment. This supports cross-model review and lets implementation use a lower-cost model for well-specified changes.

| Role | Work |
|---|---|
| Proposal reviewer | Review whether the plan can be implemented and verified without further decisions. |
| Plan reviser | Revise the plan in response to findings, preserving recorded decisions. |
| Implementer | Implement the tasks and address check failures and review findings. |
| Implementation reviewer | Review the patch against the approved plan. |

Every worker turn starts in a fresh context, even when the same model is assigned to several roles.

[openspec-loop-bench](https://github.com/pfa230/openspec-loop-bench), under active development, compares model combinations on the same prepared OpenSpec proposals. It evaluates the resulting changes, reported cost and elapsed time. See that repository for the methodology and dated results, and the [configuration reference](docs/configuration.md) for role assignments.

## Getting started

Install Node 24 or later on Linux or macOS, Git, Bash, and OpenSpec 1.14.0 or later, with their commands on PATH. Initialize the project with `openspec init` and install OpenSpec's skills for the tools in use. Install and authenticate the agent CLIs before running them unattended.

The example below uses Codex for review and Claude Code for revision and implementation. Claude Code's auto permission mode requires a supported model and account; see [agent permissions](docs/configuration.md#agents-and-permissions) for alternatives and sandboxing.

```sh
npm install -g openspec-loop
```

In the project, create `openspec/loop.yaml`:

```yaml
defaultBranch: main
worktrees: .worktrees
agents:
  codex: [loop-codex, -s, read-only]
  claude: [loop-claude, --model, opus, --permission-mode, auto]
roles:
  proposalReviewer: codex
  planReviser: claude
  implementer: claude
  implementationReviewer: codex
attempts:
  proposalReview: 3
  implementation: 3
checks:
  - npm test
delivery: local
```

Set `defaultBranch` to the project's default branch and replace `npm test` with its required check commands. An explicit `checks: []` means there are no required checks. This example uses `local` delivery, which leaves the completed change on its branch without pushing or changing the default branch.

Add these entries to `.gitignore`:

```gitignore
.worktrees/
openspec/loop.local.yaml
```

Install the loop's skills, then commit the configuration, ignore rules and installed files:

```sh
loop setup
```

This installs `loop-propose`, `loop-scope`, `loop-proposals` and `loop-run` into `.agents/skills/` and `.claude/skills/`. Use `$loop-propose` in Codex or `/loop-propose` in Claude Code; the other skills follow the same naming convention.

### Running a change

For a first run, create a worktree on a new branch from the configured default branch (here, `main`):

```sh
git worktree add .worktrees/first-change -b first-change main
cd .worktrees/first-change
```

In that worktree, use `loop-propose` to prepare one change with the agent. Review the plan, resolve its questions and commit its artifacts. The worktree must be clean before starting the run.

Run this from that worktree, replacing `<change>` with the proposal's name:

```sh
loop run <change>
```

The loop uses the current branch and worktree. It prints progress and a final report with the outcome and transcript paths. With the example's `local` delivery, the completed implementation and archived proposal remain committed on that branch for inspection.

For batch work, use the [attended scoping workflow](docs/workflow.md#prepare-a-batch). Proposals must land on the default branch before the supervisor starts several runs from it. Dependent changes need to wait until their prerequisites land.

Use `loop status <change>` to inspect a run, `loop stop <change>` to stop it, and `loop resume <change>` to continue after resolving a stop. To advance one stage at a time, use `loop step <change>`. See [Operations](docs/operations.md) for command syntax and recovery.

## Documentation

- [Workflow](docs/workflow.md): attended proposing, batch readiness, review, integration and delivery.
- [Configuration](docs/configuration.md): installation details, settings, model commands, permissions and sandboxing.
- [Operations](docs/operations.md): commands, progress, supervision, stopped runs and recovery.

## Development

```sh
npm ci
npm test
```

`npm test` builds the package and runs its tests. The product contract is `openspec/specs/loop-workflow/spec.md`. Repository contribution and release instructions are in `AGENTS.md`.
