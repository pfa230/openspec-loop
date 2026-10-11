# Design

## Context

See `proposal.md` for motivation and `specs/loop-workflow/spec.md` for the amended contract.

`src/controller.ts` currently selects merge immediately for PR integration; the other modes already attempt `git rebase --quiet --no-update-refs`, abort on conflicts, and merge with `--ff --no-edit`. The same function handles interrupted operations, patch comparison, integrated checks and returning merge conflicts to implementation. `src/git.ts` selects the remote-tracking base for PR mode, including custom fetch mappings.

PR delivery already runs after archival, pushes without force or setting an upstream, and returns a failed push through the existing stop/report path before any `gh` command. Enrollment in `src/commands.ts` uses a clean, committed user branch as given and does not check its publication history. The current spec and README explicitly require PR merge-only integration; this change replaces that rule, rather than treating it as an implementation detail.

## Goals / Non-Goals

**Goals:** Reuse the existing rebase-first integration path and ordinary delivery failure handling, with real Git coverage for PR history and publication timing.

**Non-Goals:** Add publication tracking, enrollment remote checks, force pushes, mode-specific integration options, or automatic reconciliation of user-published history. Change the mode's base selection, default-branch synchronization, checks, review or interruption recovery.

## Decisions

### One integration path

Remove the PR merge shortcut in `integration()`. Whenever the base is not already an ancestor of the run's tip, attempt the existing rebase in every mode. Merge only after a rebase conflict has been detected and the rebase aborted; other rebase failures remain execution failures. Keep the current Git flag overrides, conflict handoff, patch comparison and required checks.

Keeping PR merge-only integration would fail issue #47's linear-history acceptance. A configurable method would add an option without a delivery need. The existing fallback is necessary because the implementer receives and resolves a merge conflict, rather than an in-progress rebase.

### Already-pushed branches use ordinary push rejection

Do not inspect the change branch's publication at enrollment. Rebase it under the same integration rule, even if the user previously pushed it. At delivery, retain the current non-force push; if Git rejects it, stop before listing or creating a PR and report Git's output, transcript and normal continuation command. The user reconciles the histories in the run's worktree before explicitly resuming or stepping delivery. Recovery does not require new controller code or state.

A publication check adds network/ref handling, can miss branches pushed after enrollment, and does not remove the need to handle push rejection. Preserving published commits by switching to merge would restore a second integration rule. Force pushing would replace remote history. Git's existing rejection at the action that matters is sufficient.

### Verify observable history with existing fixtures

Update the PR integration test in `test/integration.test.ts` to expect a rebase onto `published/trunk` and a delivered branch without integration merge commits. Retain the custom fetch mapping and unchanged local default-branch assertions. Extend the existing conflict fixture to PR mode with a moved upstream and verify rebase abort, merge handoff, resolution, checks and review.

Use the existing `step` command and bare origin fixture in `test/delivery.test.ts` to inspect the remote through the pre-delivery stage boundaries and after delivery. For an already-pushed user branch, move the remote base so the rebase really replaces a published commit; verify the delivery rejection, unchanged remote tip, no `gh` calls and the ordinary report. Reconcile the published history by hand in the fixture, then explicitly continue delivery and verify the PR. Reuse `makeRepo`, `addOrigin`, `remoteTip` and `ghCalls`; do not add a new test harness.

## Risks / Trade-offs

- Rebasing an already-pushed user branch can stop a run at delivery after implementation and archival have completed. Document this consequence in the README's integration and PR delivery guidance; retain the non-force push and explicit recovery.
- Rebase changes commit IDs named by earlier review records. The existing patch comparison determines whether approval still stands, and existing documentation already explains how those earlier commits remain inspectable until Git prunes them.
- Manual reconciliation after archival is the user's responsibility. Continuing delivery does not rerun completed integration, checks or review, consistent with the existing recovery contract.

## Cut Pass

Removed the migration/rollback plan: this change adds no configuration or state format to migrate, and operates through existing stage recovery. Kept every existing scenario because native OpenSpec validation requires complete modified blocks; "Pull request integration" now specifically checks the remote base while the local default branch remains unchanged.

Omitted enrollment publication detection: Git's existing delivery rejection handles the concrete failure, including publication after enrollment. Omitted new integration options, publication state, custom recovery code and a new test harness because existing mechanisms suffice.

Implementation cut: removed the PR-specific merge shortcut and its `merge` flag. The existing merge fallback now runs directly after an aborted rebase conflict, with no added controller mechanism. Reused the local conflict fixture for PR coverage and retained two delivery regressions for publication timing and already-published history.

Each retained item below names its contract or requested purpose and the failure of a simpler alternative. Existing mechanisms are reused, not reimplemented.

- Rebase-first integration: Integration method; retaining the PR shortcut leaves unnecessary merge commits. Use the existing shared path.
- Conflict-only merge fallback: Integration method; rebase alone leaves the implementer without the contracted merge conflict handoff. Reuse the current fallback.
- Non-force publication only at delivery: Integration and delivery and issue #47; earlier pushing publishes work before integration, and force pushing replaces remote history. Retain the existing push.
- Ordinary rejected-push stop and explicit continuation: Integration and delivery and Run control; treating rejection as success would claim delivery without publishing the result. Retain the existing report, transcript and continuation command.
- Rebase ref-update override: preservation of unrelated work in Integration and delivery; dropping `--no-update-refs` can move other branches. Retain the current flag.
- Merge fast-forward override: Integration method; dropping `--ff` can let `merge.ff=only` prevent the fallback. Retain the current flag.
- Patch comparison: Reviews and verdicts; omitting it can deliver an unreviewed changed patch. Retain the existing comparison.
- Integrated required checks: Integration and delivery; omitting them can deliver a failing integrated result. Retain the existing checks.
- Rejected-push transcript record: Progress and usage reporting; an exit status alone omits Git's cause. Reuse the existing log.
- Stop report record: Run control; a transcript alone omits the stage and continuation available. Reuse the existing report.
- Task 1.1, shared-path edit and mapped-upstream regression: Integration method and Delivery remote; progress-text assertions alone do not establish linear delivered history or the correct base.
- Task 1.2, PR conflict regression: Integration method and Implementation cycle; clean-history coverage cannot establish abort, conflict handoff and review of the resolution. Extend the current fixture.
- Task 1.3, integration README: issue #47's documentation acceptance; leaving it unchanged promises the removed merge-only rule. Edit the existing paragraph.
- Task 2.1, publication boundaries regression: issue #47 and Integration and delivery; final remote-tip assertions cannot prove that nothing was pushed before delivery. Inspect existing step boundaries.
- Task 2.2, already-pushed branch rejection and recovery regression: the issue's explicit decision request, Integration and delivery and Run control; fresh-branch tests cannot establish non-fast-forward rejection or continuation without replaying completed stages. Use the existing bare origin and user-branch fixture.
- Task 2.3, published-branch README: the issue's explicit decision request; the shared-rule paragraph alone omits the user recovery needed for previously published history. Extend existing delivery guidance.
- Task 3.1, package and OpenSpec validation: the repository's required `npm test` instruction and Native archival; a build alone misses runtime regressions, and package tests do not validate the spec delta. Use the two existing commands.
- Proposal record: Attended proposal; without it the behavior change has no native proposal explaining its scope.
- Spec delta record: the repository's contract-first instruction; changing code alone would contradict Integration method.
- Design decision record: Attended proposal and issue #47's open question; omitting it leaves published-branch behavior undecided for implementation.
- Task checklist record: the explicitly invoked proposing workflow; omitting it leaves the configured apply dependency incomplete. Keep seven concrete tasks.
- Native change metadata record: the explicitly invoked proposing workflow; omitting the generated metadata loses the change's declared schema.
- New configuration options: none; the existing delivery setting selects the mode.
- New state fields: none; existing stage completion and stop state already support recovery.
- New runtime records: none; existing transcripts and stop reports already hold the rejection evidence.
