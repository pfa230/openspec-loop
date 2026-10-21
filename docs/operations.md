# Operations

[README](../README.md) · [Workflow](workflow.md) · [Configuration](configuration.md)

## Commands

Run commands from a checkout of the repository. Commit the proposal before starting its run; see [Prepare a change](workflow.md#prepare-a-change) for branch and worktree selection. Starting a new run registers the change with the loop, a step called enrollment.

| Command | Action |
|---|---|
| `loop run <change> [<agents>]` | Start a new run and continue until it finishes or stops. Refuse if a run already exists for the change. |
| `loop step <change> [<agents>]` | Start or continue a run, returning after the next stage completes successfully. |
| `loop resume <change> [<agents>] [--attempts <n>] [--implement] [--review]` | Continue from the first incomplete stage, with options to grant a different attempt budget or reopen earlier stages. |
| `loop status <change>` | Show state, branch, stage status and paths. |
| `loop stop <change>` | End the current step. Ctrl-C or closing the terminal also stops a foreground run. |

`run`, `resume` and `step` exit 0 on completion or a successful stage boundary, 1 on a stop, and 2 on refusal. A successful `step` does not necessarily mean the run is complete; read its report. `status` and `stop` exit 2 if the run does not exist.

`<agents>` means exactly four configured aliases, in this order: proposal reviewer, plan reviser, implementer, implementation reviewer. For the aliases in the README example:

```sh
loop run <change> codex claude claude codex
```

The command writes these role assignments to `openspec/loop.local.yaml` in the run's worktree, preserving its other entries. Later commands invoked from that worktree read those assignments.

Resume options:

| Option | Effect |
|---|---|
| `--attempts <n>` | Replace both configured attempt budgets for this `resume` call. |
| `--review` | Reopen proposal review and all later stages, retaining the branch's work. A pending revision of the previous plan is dropped. Refused after archival. |
| `--implement` | Reopen implementation and all later stages, leaving proposal-review status unchanged. Refused after archival. |

### Run directly from the CLI

For manual operation, prepare a single change on its own branch and worktree. For example, with `main` as the configured default branch:

```sh
git worktree add .worktrees/first-change -b first-change main
cd .worktrees/first-change
```

Prepare the proposal there and commit its artifacts. From the clean worktree, run `loop run <change>`, replacing `<change>` with the proposal's name. The loop uses that branch and worktree. From the default branch, it creates them instead.

The CLI runs in the foreground, so keep its process alive while it works. Another session can inspect the saved state or resume after a stop. Direct CLI use does not provide the agent's failure diagnosis and recovery described under [Supervising with an agent](#supervising-with-an-agent).

### Advance one stage at a time

```sh
loop step <change>     # review the proposal, including revisions and minor fixes
loop status <change>   # inspect the boundary and next stage
loop step <change>     # implement, check, review and revise
loop resume <change>   # continue through integration, archive and delivery
```

Use `step` to inspect the result after each stage. Each call starts with the configured attempt budgets and handles revisions until a stage succeeds. It may return to an earlier stage: for example, an implementer can report a plan problem that needs revision and another proposal review. In that case, `step` returns after proposal review succeeds, with implementation still pending. The report names the next stage and the commands to continue.

## Progress and reports

Each progress line identifies the stage, start or end, and worker alias where applicable. A completed worker line reports input tokens, output tokens and cost, for example:

```text
(claude; input 332,936, output 2,234, cost $0.57)
(codex; input 16,641, output 59, cost unavailable)
```

An unreported value is `unavailable`; an explicit zero stays zero. Cost is rounded to cents, so less than half a cent appears as `$0.00`. `usage unavailable` means the worker reported nothing. [Usage accounting](configuration.md#usage-accounting) explains the harness differences.

The report at completion, a stop or a stage boundary totals usage by role. It includes every worker step since the run began, including steps from earlier `resume` and `step` calls:

```text
Usage by role:
  proposalReviewer: 2 steps; input 33,282, output 118, cost unavailable
  implementer: 3 steps, 1 without usage; input 491,414, output 5,120, cost $1.20, 1 step without cost
```

Each value sums only the steps that reported it. `without usage` counts missing, empty or malformed usage files; malformed usage also stops the run. When only some steps report cost, the report states how many did not. It does not estimate the missing cost.

Every run stores state and transcripts in the repository's Git directory, normally `.git/openspec-loop/<change>/`. `loop status` and the report print the exact worktree and run-directory paths. `transcripts/` contains worker output, replies, review verdicts, check findings and command logs. Review verdicts identify the commits they cover; archive output is retained as `NNN-archive.log`.

## Supervising with an agent

Use `$loop-run` in Codex or `/loop-run` in Claude Code. The agent running this skill is the supervisor: it uses the same CLI commands as a person at a terminal, relays progress and presents the final report unchanged. [Batch supervision](workflow.md#choose-and-run-a-batch) starts several ready changes concurrently from the default branch.

When a run stops, the supervisor reads the report, transcripts, configured agent command and findings before changing anything. It checks whether the worker failed or the adapter rejected its reply, identifies which edits were committed, and reports which checks and reviews have finished. It states what remains unknown when the records do not establish the cause.

When the existing instructions, source issue, plan or repository rules settle the decision, the supervisor can revise the plan and resume the run. It explains the recovery and commits any plan edits on the run's branch before resuming with `--review`. It can grant a new attempt budget with `--attempts`. It asks for help when a decision remains open or the same failure returns after its recovery.

The user handles problems with the environment, credentials, quota, main checkout or remote, and decides whether to discard a run or change a recorded design decision. The supervisor does not resume a run the user asked to stop. After a successful `step`, it waits for an explicit instruction to continue.

For decision questions, the supervisor answers those already settled by the available sources and cites the evidence. It presents the remaining questions with their choices, tradeoffs and recommendations. After the user answers or approves the recommendations, it records the decisions in the design, commits them and resumes.

The loop writes the shared Git directory and starts workers. Supervision commands therefore run outside the session's sandbox; Codex requests escalated permissions for each command.

## Recovering a stopped run

Start with `loop status <change>` and the transcript named by the stop report. A failed check, rejected review and execution failure require different responses. The loop reports the observed cause; it does not investigate it or retry an execution failure automatically.

| Stop | Recovery |
|---|---|
| Review or check attempts exhausted | Inspect why the attempts failed, resolve any plan problem, then use `loop resume <change>` or `--attempts <n>` for a fresh budget. |
| Worker exits nonzero, is killed, or supplies a missing or malformed reply | Read its transcript and reply to identify the failed operation. Correct the cause, then resume. |
| Review asks for a decision | Record the answer in the design on the run's branch, commit and resume. |
| Implementer changes the plan beyond task marks | Revert the plan changes from the named turn's commit on the run's branch, then resume. |

Resuming implementation starts another implementer turn, even if the previous attempt stopped during checks or review. If a check already fails on the base branch, the implementer is not authorized to repair unrelated code to make it pass.

Uncommitted edits outside the active change directory in a stopped run's worktree join the next implementer commit and become part of the patch. They receive checks and review, except during approved minor fixes, which rerun checks without another review.

### Plan edits and decision stops

The stop report identifies the worktree and branch to edit. When a run stops for a decision, record the answer in the design, commit it and resume; the loop returns to proposal review. Other manual plan edits do not automatically invalidate approval or reopen completed stages. To review an edited plan before continuing, use:

```sh
loop resume <change> --review
```

This reviews the current plan and continues from the branch's existing work. Use `--implement` when the edit needs implementation without reopening proposal review; any still-pending proposal review runs first. Both options refuse an archived change. The supervisor always uses `--review` after a plan edit it makes.

### Interrupted processes

A run accepts only one active `run`, `step` or `resume` command at a time. If that process dies, `resume` can take over and redo the interrupted step.

A SIGKILL or OOM kill can leave the worker running. In that case, resume refuses and identifies its process group. Check the group's identity with `pgrep -l -g <group>` before acting. If it belongs to the worker, wait for it to exit or end it with `kill -- -<group>`, then resume. If the group ID was reused and belongs to another process, set `stepGroup` to `null` in the run directory's `state.json` instead of killing that process.

If an interruption leaves a rebase or merge in progress before its conflict reaches the implementer, integration aborts it when retried.

### Archive recovery

When OpenSpec refuses archival, read the archive log, correct the change in the run's worktree, commit the correction and resume. Archive is retried without reviewing that correction, so verify it before resuming.

If OpenSpec finished archival before the interruption, resume recognizes that the active change is gone and commits the archive if needed. An interruption inside `openspec archive` can leave a partial archive with the active change still present. After confirming that state, undo the partial archive in the run's worktree and resume:

```sh
git restore --source=HEAD --staged --worktree openspec
git clean -fd openspec/changes/archive
loop resume <change>
```

The restore discards uncommitted OpenSpec edits and the clean removes untracked archive files. Inspect those paths first and preserve any unrelated work.

### Delivery recovery

| Stop | Recovery |
|---|---|
| Default-branch checkout has uncommitted tracked changes | Commit or discard them deliberately, then resume. |
| Default branch moved, or upstream rejected a push because it moved | Bring the new commits into the run's branch in its worktree, then resume. |
| Local default branch is ahead of or diverged from its upstream in `merge` mode | Push or remove the extra commits, or reconcile the branches, then resume. |
| A rebased PR branch cannot be pushed without force | Reconcile the run's branch with its published history, verify the result, then resume or step. |
| Local fast-forward would overwrite a file | Clear the obstruction Git names, preserving any needed work, then resume. |
| `gh` is missing, unauthenticated or fails after the push | Correct that cause and resume; the earlier push is retained. |

After a delivery stop, `resume` retries delivery without repeating completed integration, checks, review or archival. Verify any manual conflict resolution or other edits before resuming. The loop reuses an existing open PR for the run's branch and target, and repeated pushes or fast-forwards to the same commit do nothing.

### Discard a run

Use `loop status <change>` to locate the run directory and worktree. Stop any active run and preserve needed work before removing them.

For a run enrolled from the default branch, remove the worktree and branch the loop created:

```sh
git worktree remove --force "<worktree>"
git branch -D loop/<change>
```

For a run enrolled on an existing branch, retain that branch and worktree to preserve their work. Remove the recorded run directory to discard the run's state:

```sh
rm -rf "<run directory>"
```

Use the exact path printed by status. With the old state removed, `loop run` can start a new run from a committed proposal.

## Scoping commands and recovery

Both commands accept one session name and no options:

| Command | Action | Exit status |
|---|---|---|
| `loop scope start <session>` | Create `scope/<session>` and its worktree from the committed local default branch. Print paths and the finish command. | 0 created; 2 refused |
| `loop scope finish <session>` | Rebase the clean session onto the current base and deliver its committed proposals. | 0 delivered; 1 integration/publication failed; 2 refused |

Git validates the generated branch name. Branch or path collisions refuse without replacement. Finish finds the session checkout through Git's worktree list. If a manual rebase detached it, locate it with `git worktree list` and complete or abort the rebase, or restore the session checkout before retrying.

Run start and finish from the same invoking checkout. The session inherits main-checkout settings through [local overrides](configuration.md#local-overrides), but receives no copy of the invoking checkout's local file.

Use the reported session worktree for native proposing, every artifact command and each proposal commit. Check the root from `openspec list --json` and the resolved paths from OpenSpec's instructions before writing or staging. Follow the selected store's instructions when the project uses an OpenSpec store. Git writes need access to the shared Git directory; if a sandbox refuses them, request that access rather than authoring in the default checkout.

Each finished proposal gets a separate artifact-only commit, for example:

```text
docs(scope): propose add-export (relates to #14)
```

Commit only `openspec/changes/<change>/`, record the source issue in the proposal and decisions in the design, and leave the source issue open. Interrupted drafting resumes in the same worktree with completed proposal commits retained. Finish refuses any uncommitted tracked or untracked files; it does not commit, stash or remove unfinished work.

### Finish failures

Scope finish rebases onto the local default branch in `local` mode and the fetched upstream in `pr` mode. In `merge` mode it first synchronizes the local default branch with the upstream, then rebases onto it. Unlike run integration, a conflicting scope rebase is aborted for attended recovery; there is no automatic merge fallback.

Before updating the default branch, finish checks that its checkout has no uncommitted changes to tracked files. It preserves unrelated untracked files and refuses to overwrite files, including ignored ones. In `merge` mode, it also stops if the local default branch is ahead of its upstream or has diverged from it. Resolve any conflict, rejected push or failed fast-forward before retrying from the checkout where the session was started.

In `pr` mode, finish pushes without force before reusing an open PR or creating one with `gh pr create --fill`. If a retry rebases an already-published session branch, the push can be rejected. Reconcile both histories in the session worktree, substituting the actual remote and branches:

```sh
git fetch origin scope/planning main
git merge --no-edit origin/scope/planning
git merge --no-edit origin/main   # if it is not already an ancestor of HEAD
```

Resolve and commit any conflicts. Both the published session tip and the current base must be ancestors of the session tip; resetting only to the published tip would repeat the rebase and rejection. Retry `loop scope finish planning` from the original invoking checkout.

If a `merge` push succeeded but the local fast-forward failed, clear the reported obstruction and retry to finish the local update. Successful finish retains the session branch and worktree for inspection or manual Git cleanup. See [Prepare a batch](workflow.md#prepare-a-batch) for landing proposals and starting their runs.
