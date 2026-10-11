# Spec Delta

## MODIFIED Requirements

### Requirement: Integration method

In every delivery mode (`local`, `pr` and `merge`), the loop SHALL rebase the change's branch onto the base, and when the rebase conflicts it SHALL abandon the rebase and merge instead. A conflicted merge SHALL stay in progress in the run's worktree for the implementer, and the loop SHALL conclude it with the implementer's resolution. Patches SHALL be compared without context lines or line numbers.

#### Scenario: Clean rebase
- **WHEN** in any delivery mode the base has moved and the change's branch rebases onto it without conflicts
- **THEN** the change's commits sit on the base in a line, with no merge commit

#### Scenario: Rebase conflicts
- **WHEN** in any delivery mode the rebase onto the base conflicts
- **THEN** the loop abandons the rebase, leaving the branch's commits as they were, and merges the base instead

#### Scenario: Merge conflicts
- **WHEN** the merge of the base into the change's branch conflicts
- **THEN** the loop returns the conflicted files to the implementer as findings, and after the implementer's turn the merge commit holding the resolution is on the change's branch

#### Scenario: Pull request integration
- **WHEN** in `pr` mode the remote's default branch has moved while the local default branch is unchanged and the change's branch rebases without conflicts
- **THEN** the loop rebases onto the fetched remote branch, leaves the local default branch unchanged and delivers the rebased branch to the pull request without an integration merge commit

#### Scenario: Integration changes the patch
- **WHEN** integration completes without conflicts but the change's patch differs from the one implementation completed with, such as when the base already holds part of the change
- **THEN** the integrated result returns to the implementer as findings, and is checked and reviewed before archival

### Requirement: Integration and delivery

The run SHALL work on the change's branch. When enrollment through `loop run` or `loop step` occurs on a branch other than the default branch, that branch is the change's branch and the run works in its worktree; when enrollment occurs on the default branch, the loop creates the change's branch from that commit in a worktree of its own. The run SHALL preserve unrelated work in every checkout. The base, which the loop integrates the change with and delivers it to, is the remote's default branch in `pr` mode and the local default branch in `local` and `merge` modes. Before archival, the loop SHALL integrate the change with the current base; a conflict, an integration that changes the change's patch, or a failed required check on the integrated result SHALL return to the implementer as findings. Only `merge` mode SHALL change the local default branch, and only by fast-forward when every checkout holding it is clean, meaning it has no uncommitted changes to tracked files; otherwise the run SHALL stop and name the checkout. Before integrating in `merge` mode, the loop SHALL fast-forward a local default branch that is behind its remote, and SHALL stop the run when it is ahead or has diverged. Every action outside the run's worktree, such as updating or pushing a branch or opening a pull request, SHALL be reported as its own progress line. The configuration SHALL select one delivery mode: `local`, where the run stops with the archived change committed on its branch and pushes nothing; `pr`, where only at delivery, after integration and archival, the loop pushes the change branch without force and then opens a pull request on the repository's GitHub remote; or `merge`, where the loop pushes the change branch's commit to the remote's default branch and then fast-forwards the local default branch to it. Before changing anything in `merge` delivery, the loop SHALL check that every checkout holding the default branch is clean and that the change's branch contains the default branch. A failed fast-forward or a rejected push SHALL stop the run, and a rejected push SHALL leave the local default branch unchanged.

#### Scenario: Run on the default branch
- **WHEN** the user runs `loop run` on the default branch
- **THEN** the loop creates a new branch for the change from that commit in a worktree of its own, and enrollment leaves the default branch and the invoking checkout's files and index untouched

#### Scenario: Run on a change branch
- **WHEN** the user runs `loop run` in a worktree on a branch of its own
- **THEN** the run commits on that branch in that worktree, in every delivery mode

#### Scenario: Local delivery
- **WHEN** the run completes in `local` mode
- **THEN** the archived change is committed on its branch, nothing is pushed and the default branch is untouched

#### Scenario: Pull request delivery
- **WHEN** the run completes in `pr` mode
- **THEN** the change branch is pushed, a pull request is open against the default branch and the local default branch is untouched

#### Scenario: Merge delivery
- **WHEN** the run completes in `merge` mode
- **THEN** the default branch is fast-forwarded to the change branch and pushed

#### Scenario: Clean integration
- **WHEN** during ordinary advancement the change integrates with a moved default branch without conflicts, its patch is unchanged and the required checks pass
- **THEN** the run continues to archival without another review

#### Scenario: Integration fails
- **WHEN** integration conflicts or a required check fails on the integrated result
- **THEN** the failure returns to the implementer as findings, and the fix is checked and reviewed before archival

#### Scenario: Default branch behind its remote
- **WHEN** in `merge` mode the local default branch is behind its remote and its checkout is clean
- **THEN** the loop fast-forwards it before integrating and reports the fast-forward as a progress line

#### Scenario: Dirty checkout
- **WHEN** the loop needs to change the default branch and a checkout holding it has uncommitted changes to tracked files
- **THEN** the run stops before changing anything and names the checkout

#### Scenario: Untracked files in the checkout
- **WHEN** the loop needs to change the default branch and a checkout holding it has only untracked files that the change does not touch
- **THEN** the loop fast-forwards the default branch and leaves those files in place

#### Scenario: Unpushed commits on the default branch
- **WHEN** in `merge` mode the local default branch is ahead of its remote
- **THEN** the run stops instead of publishing those commits

#### Scenario: Diverged default branch
- **WHEN** in `merge` mode the local default branch and its remote have diverged
- **THEN** the run stops at integration, names both branches, and changes neither

#### Scenario: Push rejected
- **WHEN** in `merge` mode the remote's default branch moves after integration and the push is rejected
- **THEN** the run stops at delivery with Git's message, and the local default branch is unchanged

#### Scenario: No PR publication before delivery
- **WHEN** a `pr` run has completed integration and archival but has not started delivery
- **THEN** the loop has pushed nothing, and the change's branch is published only when delivery runs

#### Scenario: Already-pushed change branch
- **WHEN** a `pr` run enrolls on the user's already-pushed change branch and rebasing onto the moved base makes its delivery push non-fast-forward
- **THEN** enrollment does not refuse because the branch was pushed, integration rebases it, and the non-force push stops the run at delivery with Git's rejection and its transcript, leaving the remote branch and local default branch unchanged and making no pull request command

#### Scenario: Continue after a rejected PR push
- **WHEN** the user reconciles the change's branch with its published history after a rejected PR push and explicitly resumes or steps the run
- **THEN** the loop resumes at delivery without repeating completed stages, retries the non-force push and, on success, opens or finds the pull request
