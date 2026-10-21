# openspec-loop

openspec-loop combines attended planning with unattended implementation and cross-model review. A developer and agent prepare a batch of OpenSpec proposals, resolving scope and design questions before implementation starts. The loop then implements, tests and reviews each change.

## Why this workflow

An issue describes a problem, but often leaves questions about scope and behavior unanswered. If an agent makes those decisions on its own, the resulting code can pass review and still miss the intended behavior.

OpenSpec separates planning from implementation. During an attended planning session, the developer answers questions and works through design choices with the agent. The proposal, design, specifications and tasks record the agreed scope and give both implementation and review a common reference.

Once a batch of proposals is ready, openspec-loop handles implementation, checks and review without requiring the developer to supervise each agent turn. If review raises a question the plan does not answer, the run stops for a decision.

Cross-model review uses a different model to examine the implementation for mistakes the authoring model missed. Separate role assignments also allow a lower-cost model to implement well-specified tasks while a stronger model handles review.

## How it works

1. **Prepare proposals.** Use `loop-scope` to work through selected issues. Resolve design questions, define each change's scope and commit the finished proposals separately.
2. **Choose what to run next.** `loop-proposals` identifies dependencies and recommends an order. Independent changes can run concurrently; dependent changes wait until their prerequisites land.
3. **Start the runs.** Invoke `loop-run` from the default branch with the selected change names. It starts a separate run and worktree for each, and reports their progress.
4. **Handle stops.** The agent running `loop-run` investigates failures and can revise plans without changing recorded decisions. It asks for input when a decision remains open. One stopped run does not delay the others.

Each run follows the same stages:

```text
Proposal review -> Implementation, checks and review -> Integration -> Archive -> Delivery
```

The loop revises the work in response to review findings, within configured attempt limits. Once checks and review pass, it integrates the change, updates the specifications and archives the proposal. Delivery can leave the result on a local branch, open a pull request, or push to the default branch.

Each run saves its state and every worker's transcript, so another agent session can inspect it or resume it after a stop.

See [Workflow](docs/workflow.md) for proposing, batch dependencies and review rules.

## Choosing models

Configure a model for each of the four roles:

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

The example below configures a Node.js project that uses `npm test` for its checks, Codex for review, and Claude Code for revision and implementation. Replace `npm test` with the commands required by the project. Claude Code's auto permission mode requires a supported model and account; see [agent permissions](docs/configuration.md#agents-and-permissions) for alternatives and sandboxing.

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

Set `defaultBranch` to the project's default branch. An explicit `checks: []` means there are no required checks. This example uses `local` delivery, which leaves the completed change on its branch without pushing or changing the default branch.

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

1. Use `loop-propose` to prepare one change with the agent, or `loop-scope` to work through several issues. Review the plans and resolve their questions. `loop-scope` creates a scoping worktree and commits each proposal separately.
2. Have the agent commit and land the proposals on the configured default branch. For a scoping session, ask the agent to finish it. With the example's `local` delivery, finishing updates the local default branch; other modes are described in the [scoping workflow](docs/workflow.md#prepare-a-batch).
3. Use `loop-proposals` to inspect dependencies and choose what to run next.
4. From the default branch, invoke `loop-run` with the selected change names. For example, in Codex:

   ```text
   $loop-run run add-export and fix-timeout
   ```

The agent checks dependencies before starting the runs, which create a separate branch and worktree for each change. It monitors progress, handles stops and reports each outcome.

With the example's `local` delivery, each completed implementation and archived proposal remains committed on its run's branch for inspection. Merge a prerequisite's result into the default branch before selecting changes that depend on it.

Ask the agent running `loop-run` to inspect, stop or resume a run, or to advance one stage at a time. See [Operations](docs/operations.md) for supervision, direct CLI use and recovery.

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
