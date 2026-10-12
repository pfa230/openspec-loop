# Spec Delta

## ADDED Requirements

### Requirement: Scoping session commands

The loop SHALL provide `loop scope start <session>` and `loop scope finish <session>` for an attended proposal session. Both SHALL read the existing loop configuration and local overrides from the invoking checkout. Start SHALL create a separate branch and worktree from the configured local default branch and print their names. Scoping SHALL NOT enroll a run, execute workers, implement changes or archive proposals.

#### Scenario: Start without dirtying the default checkout
- **WHEN** the user starts a new session whose generated branch name Git accepts
- **THEN** the loop creates its proposal worktree from the committed local default branch without changing any existing checkout's tracked files or index, and reports the worktree, branch and finish command

#### Scenario: Session already exists
- **WHEN** start encounters an existing session branch or worktree
- **THEN** it refuses without resetting or replacing it and identifies the branch or path collision, reporting its registered checkout or lack of one when the branch exists

#### Scenario: Configuration and syntax refusals
- **WHEN** a scope command has missing or extra arguments, Git rejects its generated branch name, or its required loop configuration is invalid or missing
- **THEN** it exits 2 with the offending syntax or configuration identified and creates no session work

#### Scenario: Finish has no registered session checkout
- **WHEN** finish cannot find an existing registered worktree holding the named session branch, including when Git retains an entry for a deleted checkout
- **THEN** it refuses with exit 2, identifies the missing checkout and tells the user to inspect Git's worktree list and complete or abort any manual rebase before retrying, without changing files or Git operations

#### Scenario: Finish needs an upstream
- **WHEN** finish uses `pr` or `merge` and the configured default branch has no upstream
- **THEN** it refuses with exit 2 before integration or publication and identifies the branch whose upstream must be set

#### Scenario: Proposing needs no worker executable
- **WHEN** the configuration is structurally valid but a configured worker command is unavailable
- **THEN** scope commands do not resolve or launch that worker and can proceed

### Requirement: Scoping session integration

Finish SHALL require the named session worktree to be clean and rebase its branch onto the current base before delivering proposals. The base SHALL be the local default branch for `local` and `merge`, and its fetched upstream for `pr`. In `merge`, finish SHALL first synchronize the local default branch with its upstream using the run's clean-checkout and fast-forward rules. A rebase failure SHALL stop finish for attended recovery.

#### Scenario: Concurrent delivery moved the base
- **WHEN** other work has advanced the base since the session started
- **THEN** finish rebases the session's proposal commits onto that base, preserving the other work and the separate proposal commits

#### Scenario: Uncommitted session work
- **WHEN** the session worktree has uncommitted changes
- **THEN** finish refuses with exit 2 before rebasing or publishing and names the session worktree

#### Scenario: Unfinished draft at finish
- **WHEN** completed proposals are committed but an unfinished draft remains as tracked or untracked changes in the session worktree
- **THEN** finish refuses before delivery and retains both the committed proposals and draft for continued attended authoring; it does not commit or delete the draft

#### Scenario: Conflicting proposals
- **WHEN** finish's rebase conflicts
- **THEN** it aborts that rebase, exits 1, reports Git's error and the session worktree, publishes nothing and tells the user to reconcile the branch there before retrying finish

#### Scenario: Merge base ahead or diverged
- **WHEN** `merge` finish finds the local default branch ahead of or diverged from its fetched upstream
- **THEN** it exits 1 before publishing proposal commits, names the branches and asks the user to reconcile them

### Requirement: Scoping session delivery

Scoping delivery SHALL land committed proposals together: `local` fast-forwards the local default branch without remote contact; `pr` pushes the session branch without force and opens or finds one pull request; `merge` pushes to the upstream default branch before fast-forwarding the local one. Default-branch updates SHALL preserve unrelated work under the run's clean-checkout and fast-forward rules. Ordinary change-run delivery SHALL retain its existing behavior.

#### Scenario: Local proposals landed
- **WHEN** finish succeeds in `local` mode
- **THEN** the local default branch contains the proposal commits, no remote was contacted, and the proposals remain unarchived and unenrolled

#### Scenario: Proposal pull request
- **WHEN** finish succeeds in `pr` mode
- **THEN** the session branch is published to the configured default branch's upstream repository, one proposal pull request targets its upstream branch, and the local default branch is unchanged

#### Scenario: Merge proposals landed
- **WHEN** finish succeeds in `merge` mode
- **THEN** the upstream default branch contains the proposal commits and the local default branch is fast-forwarded to them

#### Scenario: Dirty default checkout
- **WHEN** finish needs to update the default branch and a checkout holding it has uncommitted tracked changes
- **THEN** it exits 1 before publishing session commits or updating that branch and names the checkout

#### Scenario: Files in the fast-forward's way
- **WHEN** a default checkout has unrelated untracked files or an untracked or ignored file that the fast-forward would overwrite
- **THEN** unrelated files remain in place and an obstructing file stops the fast-forward with Git's error rather than being overwritten

#### Scenario: Rejected publication
- **WHEN** a proposal push is rejected
- **THEN** finish exits 1 with Git's error, leaves the local default branch unchanged by that publication, opens no pull request, and never force-pushes

#### Scenario: Default ref moved after it was checked
- **WHEN** no checkout holds the default branch and another writer moves its ref after finish checked its ancestry but before finish updates it
- **THEN** finish's local update fails with exit 1 rather than replacing the concurrent commits, preserving any publication that already succeeded for attended recovery

### Requirement: Scoping session recovery

Scoping commands SHALL report external effects and retain the session branch and worktree. Finish SHALL exit 0 on success, 1 on an integration or publication failure and 2 on a refusal, naming attended recovery. A retry SHALL reuse an open PR after its non-force push succeeds; a rejected push SHALL report reconciliation before retry rather than claim completion. Scoping SHALL NOT introduce run state or automatically remove session work.

#### Scenario: Interrupted authoring
- **WHEN** an attended session is interrupted after one proposal was committed and another was partly drafted
- **THEN** the user continues in the same worktree using its files and Git history, with the committed proposal intact

#### Scenario: Push completed before local update
- **WHEN** merge finish published proposals but the local fast-forward failed or was interrupted
- **THEN** a retry recognizes the already-published commits and completes the remaining safe local update without a force push or proposal duplication

#### Scenario: Pull request already opened
- **WHEN** PR creation took effect before finish failed or was interrupted, the pull request is still open, and retry's push succeeds without rewriting published history
- **THEN** finish reports the existing pull request instead of creating a second one

#### Scenario: PR retry rebases a published branch
- **WHEN** a session branch was published and retry rebases it onto a moved upstream base, making the next push non-fast-forward
- **THEN** finish exits 1 with Git's rejection before PR lookup or creation, leaves the remote branch and local default branch unchanged, and tells the user to merge the published session history and current base into the session branch before retrying

#### Scenario: Retry after reconciling published history
- **WHEN** the user merges the published session history and current upstream base into the session branch, resolves any conflicts and retries finish with a clean worktree
- **THEN** finish preserves that ancestry, retries the non-force push and, on success, opens or finds the one proposal pull request

### Requirement: Scoping skill

The loop SHALL ship an `openspec-scope` skill for Claude Code and Codex. It SHALL rank open issues following repository instructions, explain the order, await the user's selection, and propose selected issues through native OpenSpec in the session worktree. Before separately committing each finished proposal, it SHALL record its source issue, resolve required decisions or record explicit design defaults, and trim scope, filing omitted requested work as linked follow-up issues and non-goals.

#### Scenario: Issue choice stays attended
- **WHEN** the user invokes the scoping skill
- **THEN** it reads repository instructions, lists and ranks open issues with its reasoning, and waits for the user to choose before drafting a proposal

#### Scenario: Decision sweep and individual commit
- **WHEN** a selected issue's native proposal artifacts are ready
- **THEN** the skill reviews scope and required decisions with the user, records decisions and explicit defaults in the design and the source issue in the proposal, files and links any trimmed requested work, and commits only that proposal's artifacts before moving to another issue

#### Scenario: Native proposing uses the session root
- **WHEN** the skill invokes native proposing and commits its artifacts
- **THEN** it explicitly uses the reported session worktree as the working directory, verifies the resolved artifact paths are there, and runs Git-writing scope commands and proposal commits with the permissions they require rather than falling back to authoring in the default checkout

#### Scenario: Follow-up for work outside the proposal
- **WHEN** requested work is trimmed from a proposal whose branch has not been published or whose delivery mode is local
- **THEN** the follow-up issue links the source issue and names the OpenSpec change, and the proposal's non-goals link the follow-up issue without requiring a URL for an unpublished proposal

#### Scenario: Session finish remains a proposal operation
- **WHEN** the user chooses to finish scoping
- **THEN** the skill invokes the deterministic finish command, reports its outcome and any recovery, leaves source issues open, and tells the user to enroll a proposal from the default branch after landing it there, not from the multi-proposal session branch

## MODIFIED Requirements

### Requirement: Integration and delivery

The run SHALL work on the change's branch. When enrollment through `loop run` or `loop step` occurs on a branch other than the default branch, that branch is the change's branch and the run works in its worktree; when enrollment occurs on the default branch, the loop creates the change's branch from that commit in a worktree of its own. The run SHALL preserve unrelated work in every checkout. The base, which the loop integrates the change with and delivers it to, is the remote's default branch in `pr` mode and the local default branch in `local` and `merge` modes. Before archival, the loop SHALL integrate the change with the current base; a conflict, an integration that changes the change's patch, or a failed required check on the integrated result SHALL return to the implementer as findings. For a run, only `merge` mode SHALL change the local default branch, and only by fast-forward when every checkout holding it is clean, meaning it has no uncommitted changes to tracked files; otherwise the run SHALL stop and name the checkout. Before integrating in `merge` mode, the loop SHALL fast-forward a local default branch that is behind its remote, and SHALL stop the run when it is ahead or has diverged. Every action outside the run's worktree, such as updating or pushing a branch or opening a pull request, SHALL be reported as its own progress line. The configuration SHALL select one delivery mode: `local`, where the run stops with the archived change committed on its branch and pushes nothing; `pr`, where only at delivery, after integration and archival, the loop pushes the change branch without force and then opens a pull request on the repository's GitHub remote; or `merge`, where the loop pushes the change branch's commit to the remote's default branch and then fast-forwards the local default branch to it. Before changing anything in `merge` delivery, the loop SHALL check that every checkout holding the default branch is clean and that the change's branch contains the default branch. A failed fast-forward or a rejected push SHALL stop the run, and a rejected push SHALL leave the local default branch unchanged.

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

#### Scenario: Concurrent update without a default checkout
- **WHEN** no checkout holds the default branch and another writer moves its ref after the run checks ancestry but before the run fast-forwards it
- **THEN** the run stops rather than replacing the concurrent commits, preserving any successful publication and reporting recovery

### Requirement: Integration method

For a run in every delivery mode (`local`, `pr` and `merge`), the loop SHALL rebase the change's branch onto the base, and when the rebase conflicts it SHALL abandon the rebase and merge instead. A conflicted merge SHALL stay in progress in the run's worktree for the implementer, and the loop SHALL conclude it with the implementer's resolution. Patches SHALL be compared without context lines or line numbers.

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
