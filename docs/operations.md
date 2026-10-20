# Operations

[README](../README.md) · [Workflow](workflow.md) · [Configuration](configuration.md)

## Commands

Run commands from a checkout of the repository. The proposal must be committed; see [Prepare a change](workflow.md#prepare-a-change) for branch and worktree selection.

| Command | Action |
|---|---|
| `loop run <change> [<agents>]` | Enroll and advance a new run until completion or a stop. An already-enrolled change is refused. |
| `loop step <change> [<agents>]` | Enroll or continue a run, returning after the first pending stage completes successfully. |
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
| `--attempts <n>` | Replace both configured attempt budgets for this advancement. |
| `--review` | Reopen proposal review and all later stages, retaining the branch's work. A pending revision of the previous plan is dropped. Refused after archival. |
| `--implement` | Reopen implementation and all later stages, leaving proposal-review status unchanged. Refused after archival. |

### Advance one stage at a time

```sh
loop step <change>     # review the proposal, including revisions and minor fixes
loop status <change>   # inspect the boundary and next stage
loop step <change>     # implement, check, review and revise
loop resume <change>   # continue through integration, archive and delivery
```

You can keep using `step` through the remaining stages. Each invocation receives fresh configured attempt budgets and follows internal revisions and handoffs until a stage succeeds. If implementation returns to proposal review, or integration returns to implementation, that successful stage can be earlier than the one where the call began. The report names the next stage and continuation commands.

## Progress and reports

Each progress line identifies the stage, start or end, and worker alias where applicable. A completed worker line reports input tokens, output tokens and cost, for example:

```text
(claude; input 332,936, output 2,234, cost $0.57)
(codex; input 16,641, output 59, cost unavailable)
```

An unreported value is `unavailable`; an explicit zero stays zero. Cost is rounded to cents, so less than half a cent appears as `$0.00`. `usage unavailable` means the worker reported nothing. [Usage accounting](configuration.md#usage-accounting) explains the harness differences.

The final report for a completed, stopped or stage-bounded run totals all worker steps across every advancement by role:

```text
Usage by role:
  proposalReviewer: 2 steps; input 33,282, output 118, cost unavailable
  implementer: 3 steps, 1 without usage; input 491,414, output 5,120, cost $1.20, 1 step without cost
```

Each value sums only the steps that reported it. `without usage` counts missing, empty or malformed usage files; malformed usage also stops the run. When only some steps report cost, the report states how many did not. It does not estimate the missing cost.

Every run stores state and transcripts in the repository's Git directory, normally `.git/openspec-loop/<change>/`. `loop status` and the report print the exact worktree and run-directory paths. `transcripts/` contains worker output, replies, review verdicts, check findings and command logs. Review verdicts identify the commits they cover; archive output is retained as `NNN-archive.log`.

## Supervising with an agent

Use `$loop-run` in Codex or `/loop-run` in Claude Code. The skill uses the same CLI commands as a person at a terminal, relays progress and presents the final report unchanged. [Batch supervision](workflow.md#choose-and-run-a-batch) starts several ready changes concurrently from the default branch.

When a run stops, the supervisor reads the report, transcripts, effective agent command and findings before changing anything. It distinguishes worker or harness failures from rejected replies, and identifies committed and uncommitted work and completed and pending validation. Missing evidence is reported as uncertainty.

It then states and applies a recovery within its scope: a plan edit committed on the run's branch and a resume command. Plan edits restart proposal review with `--review`; exhausted attempts can receive a new budget with `--attempts`. The supervisor hands the stop to you when the recovery needs a decision that the instructions, source issue, plan and repository rules do not settle, or when the same cause recurs after its recovery.

Environment, credential, quota, main-checkout and remote repairs remain with the user, as do discarding a run or changing a recorded design decision. A requested stop stays stopped. A successful `step` boundary waits for inspection and explicit continuation.

For decision questions, the supervisor first answers those already settled by the available sources and cites each source. It presents every remaining question verbatim, numbered, with the choices, tradeoffs and a grounded recommendation where possible. Recommendations need your answer or approval. It then records the decisions in the design, commits them and resumes.

The loop writes the shared Git directory and starts workers. Supervision commands therefore run outside the session's sandbox; Codex requests escalated permissions for each command.

## Recovering a stopped run

Start with `loop status <change>` and the transcript named by the stop report. A failed check, rejected review and execution failure require different responses. The loop reports the observed cause; it does not investigate it or retry an execution failure automatically.

| Stop | Recovery |
|---|---|
| Review or check attempts exhausted | Inspect why the attempts failed, resolve any plan problem, then use `loop resume <change>` or `--attempts <n>` for a fresh budget. |
| Worker exits nonzero, is killed, or supplies a missing or malformed reply | Read its transcript and reply to identify the failed operation. Correct the cause, then resume. |
| Review asks for a decision | Record the answer in the design on the run's branch, commit and resume. |
| Implementer changes the plan beyond task marks | Revert the plan changes from the named turn's commit on the run's branch, then resume. |

An implementation resume starts with another implementer turn on the findings. This also applies when the previous attempt stopped during checks or review, so resuming can incur an extra turn. A failing check that already fails on the base does not authorize the implementer to repair unrelated code.

Uncommitted edits outside the active change directory in a stopped run's worktree join the next implementer commit and become part of the patch. They receive checks and review, except during approved minor fixes, which rerun checks without another review.

### Plan edits and decision stops

The stop report identifies the worktree and branch for decision answers and plan edits. After a decision stop, committing the answer and resuming follows the required proposal review. For other manual edits, choose the continuation explicitly: they do not invalidate an existing approval or reopen stages automatically.

```sh
loop resume <change> --review
```

This reviews the current plan and continues from the branch's existing work. Use `--implement` when the edit needs implementation without reopening proposal review; any still-pending proposal review runs first. Both options refuse an archived change. The supervisor always uses `--review` after a plan edit it makes.

### Interrupted processes

A run accepts one active advancement at a time across `run`, `step` and `resume`. If the advancing process dies, `resume` can take over and redo the interrupted step.

A SIGKILL or OOM kill can leave the worker running. In that case, resume refuses and identifies its process group. Wait for the group to exit or end it with `kill -- -<group>`, then resume. Confirm its identity with `pgrep -l -g <group>`. If the group ID was reused and belongs to another process, set `stepGroup` to `null` in the run directory's `state.json` instead of killing that process.

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

Continuing after a delivery stop retries delivery without repeating completed integration, checks, review or archival. Manually reconciled work needs verification before continuation. The loop reuses an existing open PR for the run's branch and target, and repeated pushes or fast-forwards to the same commit do nothing.

### Discard a run

Use `loop status <change>` to locate the run directory and worktree. Stop any active run and preserve work you need before removing them.

For a run enrolled from the default branch, remove the worktree and branch the loop created:

```sh
git worktree remove --force "<worktree>"
git branch -D loop/<change>
```

For a run enrolled on an existing branch, retain that branch and worktree unless you intend to delete your own work. Remove the recorded run directory to discard its state:

```sh
rm -rf "<run directory>"
```

Use the exact path printed by status. Enrollment can then start a new run from a committed proposal.

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

Updates to the default branch require a checkout without uncommitted tracked changes, preserve unrelated untracked files, and refuse to overwrite files, including ignored ones. An ahead or diverged local default in `merge` mode, a dirty default holder, a conflict, a rejected push or a failed fast-forward requires attended recovery. Correct the cause and retry from the original invoking checkout.

In `pr` mode, finish pushes without force before reusing an open PR or creating one with `gh pr create --fill`. If a retry rebases an already-published session branch, the push can be rejected. Reconcile both histories in the session worktree, substituting the actual remote and branches:

```sh
git fetch origin scope/planning main
git merge --no-edit origin/scope/planning
git merge --no-edit origin/main   # if it is not already an ancestor of HEAD
```

Resolve and commit any conflicts. Both the published session tip and the current base must be ancestors of the session tip; resetting only to the published tip would repeat the rebase and rejection. Retry `loop scope finish planning` from the original invoking checkout.

If a `merge` push succeeded but the local fast-forward failed, clear the reported obstruction and retry to finish the local update. Successful finish retains the session branch and worktree for inspection or manual Git cleanup. See [Prepare a batch](workflow.md#prepare-a-batch) for landing proposals and starting their runs.
