# Workflow

[README](../README.md) · [Configuration](configuration.md) · [Operations](operations.md)

The work starts with an attended OpenSpec proposal. A run takes one committed change through review, implementation, integration, archival and delivery. The bundled skills help prepare and supervise that work; the CLI controls each run.

## Prepare a change

Use `$loop-propose` in Codex or `/loop-propose` in Claude Code. It follows the project's installed native OpenSpec proposing workflow, then summarizes the design and concrete changes before listing the artifacts.

During proposing, settle the decisions implementation depends on and record them in the design. The tasks and specifications should give both the implementer and reviewer enough information to tell whether the change is complete. Committing a proposal does not start a run.

There are two places to prepare and run a single change:

- **On its own branch in a worktree.** Propose and commit there, then invoke `loop run <change>` in the clean worktree. The loop uses that branch and worktree.
- **On the default branch.** Land the committed proposal there, then invoke `loop run <change>`. The loop creates `loop/<change>` and a worktree under the configured `worktrees` directory. The invoking checkout's files and index stay untouched.

Delivery mode affects the base used for integration. In `pr` mode, unpushed commits on the local default branch become part of the pull request. In `merge` mode, an ahead or diverged local default branch stops integration. Land or push the proposals before enrolling from the default branch, or prepare a single change on its own branch. See [Delivery](#delivery).

## Prepare a batch

Use `$loop-scope` in Codex or `/loop-scope` in Claude Code for an attended session over selected issues. It follows the repository's issue-listing workflow, recommends an order and asks which issues to prepare.

For each selected issue, the skill:

1. Drafts the change through `loop-propose` in the scoping worktree.
2. Asks for material decisions, records those answers and routine defaults in the design, and trims the scope to one implementable change.
3. Records `Source issue: <URL>` in the proposal and commits that proposal's artifacts separately.

It continues to the next selected issue unless the user requested a review pause. Work requested in an issue but excluded from its proposal becomes a linked follow-up issue and a non-goal in the proposal. Invoking `loop-scope` authorizes those follow-up issues. Source issues stay open until implementation.

The session commands create and deliver the planning branch:

```sh
loop scope start planning
loop scope finish planning
```

Start creates `scope/planning` in `<worktrees>/scope-planning` from the committed local default branch. It does not fetch. Author and commit proposals in the worktree it prints. Finish requires that worktree to be clean, rebases it onto the current base and delivers the proposals together. Run start and finish from the same invoking checkout so they use the same configuration and local overrides.

Scoping and run delivery use the same setting but differ in `local` mode:

| Mode | Scoping session | Completed run |
|---|---|---|
| `local` | Fast-forward the local default branch to the proposals. | Leave the result on the run's branch; do not change the default branch. |
| `pr` | Push the session branch and open or reuse one proposal PR. | Push the run's branch and open or reuse its PR after archival. |
| `merge` | Push the proposals to the upstream default branch, then fast-forward the local one. | Push the completed result to the upstream default branch, then fast-forward the local one. |

Finishing a session does not enroll, implement or archive its proposals. It retains the session branch and worktree. In `pr` mode, merge the proposal PR before starting the batch from the default branch. Starting a single run from a session branch containing several proposals would include the sibling proposal commits in that run's patch.

See [Scoping commands and recovery](operations.md#scoping-commands-and-recovery) for interrupted sessions, conflicting rebases and rejected pushes.

## Choose and run a batch

`loop-proposals` lists the active changes in the selected OpenSpec root or store, including drafts and proposals without source issues. It shows each change's name, date, summary and source issue, groups bugs first and other work by area, marks inferred classifications, and recommends an order based on dependencies and scope. It is read-only and can be used during or after scoping.

From a checkout on the configured default branch, invoke `loop-run` and name the changes to run. For example, in Codex:

```text
$loop-run run add-export and fix-timeout
```

The supervisor first reads their plans. If a change needs work the default branch does not yet contain, including another named change, it explains the dependency and proposes dropping that change from the batch. It waits for user confirmation of the selection before starting any run. Otherwise, it starts all selected runs without waiting for one to finish. Each progress line identifies its change, and one stopped or completed run does not delay the others.

The supervisor refuses a batch invoked from another branch. It does not schedule dependent changes for later execution. Once prerequisites have landed, select the dependent changes in a subsequent batch.

The CLI itself accepts one change per run. Several runs have separate state and worktrees; the `loop-run` skill coordinates them and reports their final outcomes in the requested order.

## Proposal review

The proposal reviewer examines the proposal, design, spec deltas and tasks. It judges whether the plan can be implemented and verified as one change without further decisions, preserves the design's recorded decisions, and follows the repository's rules for what a change contains. Agent instructions about how to work or report are not review criteria.

Each finding is blocking or minor. A minor finding has a local fix, such as a typo or wrong path, that cannot change behavior or a recorded decision. The loop derives the verdict from the findings:

- Any blocking finding means `REVISE`. The plan reviser works in a fresh context, the loop commits the revision, and the reviewer examines the plan again.
- Otherwise the verdict is `APPROVE`. The plan reviser applies any minor fixes, and the loop commits them without another review.

A finding that requires an unrecorded decision stops the run with a question before revision. Record the answer in the design on the run's branch, commit it and resume. The plan reviser cannot change a decision already recorded in the design.

Each review uses one proposal-review attempt. If the last allowed review returns `REVISE`, the reviser completes that revision and the run stops. A resume grants a fresh budget.

Approval ordinarily starts implementation. With `loop step`, approval instead returns control at the stage boundary. Manual plan edits do not automatically invalidate approval or change the resume point; use [review restart](operations.md#plan-edits-and-decision-stops) when needed.

## Implementation, checks and review

The implementer starts in a fresh context with the change's native OpenSpec apply instructions, including any `operations.apply.guidance` in `openspec/config.yaml`, and the findings from the previous attempt. It updates task completion marks as it works. The loop commits its work, then runs every configured check in order, even if an earlier check fails.

A failed check supplies findings for the next implementation attempt. Review waits until the checks pass. The implementer may repair failures caused by the change; pre-existing failures do not authorize unrelated repairs and can exhaust the attempt budget.

The implementation reviewer checks that the patch implements the whole approved plan, stays within its scope, preserves recorded decisions and follows the repository's rules for change content. The patch excludes the active change's planning directory. Blocking findings require revision and another review. Minor fixes are applied by the implementer, followed by the checks, without another review. If those checks fail, approval lapses and another full attempt is needed.

If the implementer finds a problem in the plan, it reports the needed change. The plan reviser revises it and returns it to proposal review, retaining the implementation attempt count. The implementer can tick task boxes but cannot otherwise edit the plan: a completed turn that does so stops the run. A turn interrupted before completion is not checked for plan edits.

An implementation attempt includes the implementer turn, checks, review and any approved minor fixes. Failed checks or a standing `REVISE` at the attempt limit stop the run. A fresh resume begins with an implementer turn on the findings, even if the previous attempt stopped during checks or review.

## Integration

The loop integrates with the current base after implementation passes. The base is the default branch's configured upstream in `pr` mode, and the local default branch in `local` and `merge` modes.

It first rebases the run's branch onto that base. If the rebase conflicts, it aborts the rebase and tries a merge. A conflicted merge stays in progress for the implementer to resolve; the loop commits the resolution with Git's merge message. The loop overrides `rebase.updateRefs` and `merge.ff` for these commands without changing the repository's configuration.

If integration changes the reviewed patch, the result returns to implementation, checks and review. Patch comparison ignores context lines and line numbers. Required checks also run on the integrated result, and failures return as implementation findings. Each return uses an implementation attempt.

In `merge` mode, the loop first fetches the upstream and synchronizes the local default branch. It can fast-forward a branch that is behind, provided the checkout holding it has no uncommitted tracked changes. It stops if the branch is ahead or diverged.

Rebasing rewrites commits. Earlier review records still identify the commits they covered, which Git retains until it prunes unreachable objects. An already-published run branch can later encounter a non-fast-forward push rejection; see [Delivery recovery](operations.md#delivery-recovery).

## Archive

After integration, the loop runs `openspec archive <change> --yes` in the run's worktree. OpenSpec validates the change, applies its spec deltas to `openspec/specs/` and moves it to `openspec/changes/archive/<date>-<change>/`. The loop commits the result.

An archive refusal stops the run without committing the archive. Its transcript contains OpenSpec's output. [Archive recovery](operations.md#archive-recovery) covers corrections and interruptions.

## Delivery

`delivery` is required; there is no default.

| Mode | Result |
|---|---|
| `local` | The archived change remains committed on its branch. No remote is contacted and the default branch is untouched. |
| `pr` | The loop pushes the run's branch without force, then uses `gh` to open a PR against the default branch's configured upstream. The title is the change name and the body is the archived proposal. The local default branch is untouched. |
| `merge` | The loop checks that the default branch's checkout has no uncommitted tracked changes and that the run contains that branch. It pushes the run's tip to the upstream branch, then fast-forwards the local default branch. |

`pr` and `merge` require a configured upstream for the default branch. The upstream determines the remote and target branch; the loop does not assume `origin/main`. `pr` also requires an installed, authenticated `gh` command.

Every action outside the run's worktree has a progress line and transcript. A rejected push stops delivery. In `merge` mode, pushing before the local fast-forward ensures a rejected push leaves the local branch unchanged; the fast-forward also refuses to overwrite files, including ignored ones.

An interrupted delivery can be resumed. The loop recognizes a push or fast-forward that already happened and reuses an existing open PR for the run's branch and target. See [Operations](operations.md) for recovery and supervision.
