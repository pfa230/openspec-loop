# openspec-loop

openspec-loop runs committed OpenSpec changes through proposal review, implementation, checks, code review and delivery. Planning is attended: the developer and agent define the scope, resolve design questions and record decisions before execution. Prepared changes run unattended, with independently configured models for implementation and review.

## Why this workflow

Implementing from a short issue description requires an agent to infer missing requirements and design decisions. Incorrect assumptions may survive implementation and code review, making them expensive to correct later. Attending every execution step also consumes developer time after those decisions are settled.

OpenSpec separates proposal authoring from implementation. An attended session establishes the requirements, scope and design, then records them in a proposal, specifications and tasks. openspec-loop executes a batch of prepared changes against those artifacts. A run stops when it encounters a decision the plan does not settle, returning that decision for human input.

Independent model assignments reflect two observations from the maintainer's use of coding agents: cross-model review often found errors missed by self-review, and less expensive models often handled implementation when requirements and tasks were explicit. These observations motivate the workflow; the companion benchmark evaluates quality, cost and execution time across model combinations.

## How it works

1. **Prepare proposals.** Use `loop-scope` for an attended session over selected issues. Resolve design questions, define each change's scope and commit the finished proposals separately.
2. **Choose a ready batch.** `loop-proposals` lists the proposals and recommends an order. Changes run together must be implementable against what is already on the default branch.
3. **Start the runs.** Invoke `loop-run` from the default branch with the selected change names. It starts an independent run and worktree for each, and reports their progress.
4. **Resolve stops.** The supervisor investigates failures and can revise plans within recorded decisions. Unresolved decisions require human input. One stopped run does not delay the others.

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

[openspec-loop-bench](https://github.com/pfa230/openspec-loop-bench), under active development, compares model combinations starting from the same committed OpenSpec proposals. It evaluates delivered quality, reported cost and wall time. Its repository contains the methodology and dated results. The [configuration reference](docs/configuration.md) describes how to assign models to roles.

## Getting started

Requirements are Node 24 or later on Linux or macOS, Git, Bash, and OpenSpec 1.14.0 or later on PATH. Initialize the project with `openspec init` and install OpenSpec's skills for the selected tools. Install and authenticate the agent CLIs before running them unattended.

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
