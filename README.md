# openspec-loop

openspec-loop runs committed OpenSpec changes through proposal review, implementation, checks, code review and delivery. You work with an agent to scope the changes and record the decisions, then run the prepared work unattended. Each role can use a different model.

## Why this workflow

I built openspec-loop around two observations from using coding agents. A different model often catches mistakes that the authoring model misses when reviewing its own work. And once a change has a clear specification and concrete tasks, a less expensive model can often implement it well.

Getting to that specification still takes judgment. A short issue description can leave important choices open, and an agent working alone may make a plausible decision that misses the intent. Reviewing the resulting code is a costly way to discover that the wrong problem was solved. Staying beside the agent through every implementation step, however, consumes time even when the decisions have already been made.

OpenSpec provides a useful division of work. Proposing is a conversation: clarify the problem, settle the scope, work through tradeoffs and record the result in a proposal, design, specs and tasks. Those artifacts give implementation and review a common reference.

openspec-loop automates the work that follows. The intended workflow is to prepare a batch of changes in an attended session, then let them run through implementation and review. When a run encounters a decision the plan does not settle, it stops with a question. The aim is to spend human attention on those decisions and on preparing the work, while the loop handles the repeated execution steps.

## How it works

1. **Prepare the changes together.** Use `loop-scope` to work through selected issues with an agent. Answer its questions, define each change's scope and commit the finished proposals separately.
2. **Choose a ready batch.** `loop-proposals` lists the proposals and recommends an order. Changes run together must be implementable against what is already on the default branch.
3. **Start the runs.** From the default branch, ask `loop-run` to run the selected changes. It starts an independent run and worktree for each, and reports their progress.
4. **Resolve stops when needed.** The supervisor investigates failures and can revise plans within recorded decisions. It brings unresolved choices back to you. One stopped run does not hold up the others.

Each run follows the same stages:

```text
Proposal review -> Implementation, checks and review -> Integration -> Archive -> Delivery
```

Review findings return to the responsible agent for revision, within configured attempt limits. Integration brings in the current base and reruns the checks; conflicts or changes to the reviewed patch return to implementation. OpenSpec then applies the spec deltas and archives the change. Delivery leaves the result on a local branch, opens a pull request, or pushes it to the default branch, according to configuration.

The loop controls progression and keeps every worker's transcript. Its CLI runs in the foreground, so keep the process alive while it works. Another session can inspect or resume the run from its saved state.

See [Workflow](docs/workflow.md) for proposing, batch dependencies and review rules.

## Choosing models

The four roles are assigned separately:

| Role | Work |
|---|---|
| Proposal reviewer | Review whether the plan can be implemented and verified without further decisions. |
| Plan reviser | Revise the plan in response to findings, preserving recorded decisions. |
| Implementer | Implement the tasks and address check failures and review findings. |
| Implementation reviewer | Review the patch against the approved plan. |

Every worker turn starts in a fresh context. Assign different models to authoring and review to use cross-model review; the loop also accepts the same model in several or all roles. It does not enforce model diversity.

[openspec-loop-bench](https://github.com/pfa230/openspec-loop-bench), under active development, compares model combinations starting from the same committed OpenSpec proposals. It measures delivered quality, reported cost and wall time. Its methodology and dated results belong there; this project's [configuration reference](docs/configuration.md) explains how to use a chosen combination.

## Getting started

You need Node 24 or later on Linux or macOS, Git, Bash, and OpenSpec 1.14.0 or later on PATH. Initialize the project with `openspec init` and install OpenSpec's skills for the tools you use. Install and authenticate the agent CLIs before running them unattended.

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

Set `defaultBranch` to your project's default branch and replace `npm test` with its required check commands. An explicit `checks: []` means there are no required checks. This example uses `local` delivery, which leaves the completed change on its branch without pushing or changing the default branch.

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

For a first run, create a worktree on a new branch from your configured default branch (here, `main`):

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
