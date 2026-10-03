## Context

The repository holds only native OpenSpec setup for Claude and Codex. It has no main specs and no code. Two legacy sources inform the contract without binding it: pfa230/openspec-loop-legacy2, whose `loop-contract` spec shows how far the old guarantees grew, and the session-bridge prototype (legacy commit 5e66447), which returned review findings to a live Claude or Codex conversation through a Stop-hook backstop. This contract drops that bridge: plan revision is autonomous, and a supervising session drives the loop through its commands. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- One short spec that a reader can hold in their head and that every later build issue extends.
- Each requirement serves a concrete delivery need. pfa's decisions are authoritative; the agent-drafted build issues are input, not requirements.
- The user attends only the proposal; a well-proposed change runs to delivery without them.

**Non-Goals:**
- Participant identity, provenance records or authenticated authorship.
- Digest computation, review record formats, configuration syntax and storage layout. These belong to the build steps that need them (#3 to #8).
- Exhaustive archive replay, repository-wide enforcement, git hooks or CI integration.
- Compatibility with legacy state, artifacts, commands, schema or invariant numbering.
- Auto-merging pull requests. `pr` mode stops once the pull request is open.
- Running several changes unattended, with a queue, cross-change reporting and failure handling. Deferred until single-change runs provide evidence (#13).
- A scoping session for proposing several issues in one sitting, with a decision sweep and scope trimming. Deferred until proposing one by one shows what it needs (#14).
- Investigating failures inside the loop. A supervising Claude or Codex session diagnoses a stopped run from its report and transcripts.
- Any integration that depends on a live Claude or Codex session.

## Decisions

**One capability, `loop-workflow`.** The contract lives in a single main spec, and later changes modify its requirements or add capabilities only when a requirement needs more detail than the contract should hold. The legacy split a meta-contract from a dozen component specs that restated it, and keeping them consistent became work of its own.

**The committed proposal divides attended from unattended work.** The proposal holds every decision that needs the user; what follows is about quality, not blocking questions, so an agent can handle it. The user attends the proposal and nothing after it. Proposals are written with native `/opsx:propose`, one at a time, and committed on the default branch, because proposals kept on per-change branches were confusing; `loop run` refuses a change whose proposal is not there. Decisions live in the design, where the autonomous reviser can recognize and keep them.

**Plan revision is autonomous unless it needs a decision.** On `REVISE`, and when implementation finds the plan cannot be built as written, the implementer revises the plan in a fresh context and the plan goes back through proposal review. A finding that needs an unrecorded decision stops the run with the question. Reusing the implementer avoids a fourth role; a separate plan reviser can be added when a different model for plans is actually wanted.

**Review independence comes from a separate context, not from identity.** Every review runs in a context separate from the one that produced the work, and any role configuration is accepted, including the same model everywhere. This replaces the legacy rule that participants could not review their own work, which needed participant names, producer lists in review records and pairing refusals. pfa chose this over also refusing identical role entries.

**Minor findings do not cost a review round.** Reviewers classify findings as blocking or minor. A review with only minor findings approves, and the producer applies the fixes without another review; for implementation the required checks still run on the result. Two levels suffice because a third would not change what the loop does. A switch that forces full review of minor fixes is filed as an optional follow-up (#12).

**Three delivery modes: `local`, `pr`, `merge`.** `local` stops with the archived change committed on its branch; it serves repos without a remote and results to inspect before anything leaves the machine. `pr` pushes the branch and opens a pull request, for repos that integrate through PRs. `merge` fast-forwards the default branch to the change and pushes it. `pr` is GitHub-only. Pushing the branch without a PR, merging locally without pushing, and a draft PR were considered and left out. pfa chose this set.

**Only `merge` touches the local default branch, and only by fast-forward.** Each mode works from the branch it delivers to: `pr` from the remote's default branch, so unpushed local commits cannot ride into the pull request; `local` and `merge` from the local default branch. Integration runs before the gate, so a conflict or failed check goes to the implementer while the change is still active and the gate checks the integrated result. In `merge` mode a default branch that is behind its remote is fast-forwarded, which is what a person would do; anything else stops the run with its cause: a dirty checkout holding the default branch, a branch ahead of or diverged from its remote, a failed fast-forward or a rejected push. Every action outside the run's worktree gets its own progress line, so nothing happens silently. Pushing the change straight to the remote's default branch would have avoided touching the user's checkout, but it leaves the local branch silently behind; pfa rejected it as counter-intuitive.

**Approvals track inputs simply.** A verdict identifies its reviewed inputs precisely enough to detect a later change, and the spec does not prescribe how. An implementation approval covers the change's patch, so integrating with a moved default branch keeps it unless the patch changes. Native archive effects also keep approvals. The legacy rule that restoring approved inputs restores approval was left out because no delivery requirement in #1 needs it.

**The gate is a backstop, not proof.** The pre-archive gate catches skipped stages and stale approvals produced by the loop's own flow. It makes no claim against someone deliberately rewriting run state. Work a person does by hand during a run is that person's to verify, apart from the gate's ordinary approval check.

**The commands are the only interface, and a skill teaches the session to use them.** A Claude or Codex session supervises a run with the same commands a person types. The loop ships a supervision skill that starts the run, forwards each progress line, and on a stop investigates with the user from the report, transcripts, findings and changes between attempts, including non-convergence; it repairs or resumes only with the user's agreement. The loop never pushes into a session, so it needs no Stop hook, session binding or liveness check, and runs the same in a terminal. Every step prints a progress line with its outcome, and worker steps add their role, harness, model, usage and cost, so a run is never a black box. Usage and cost appear only as the harness reports them; the loop keeps no price table to estimate them.

**Failures stop predictably.** Execution failures and exhausted attempts stop progression and end in a report that names the step, the observed cause and the recovery. Nothing retries automatically, and the loop investigates nothing: diagnosis is the supervision skill's job, done with the user, using the report and transcripts. An investigation inside the loop would be another agent run with its own bound and failure mode, for something the session does better interactively. Every stopped run continues only on an explicit resume, which is also what grants an exhausted stage a fresh budget.

**Check failures are findings, not crashes.** A required check that runs and fails goes back to the implementer like a `REVISE`. Only a worker or the loop failing to run counts as an execution failure. The controller does not classify failures as caused or pre-existing up front. A pre-existing failure the implementer must not fix simply exhausts the attempts, and the diagnosis says it also fails on the base. A baseline check run before implementation would catch it sooner; it was filed as an optional, low-priority feature (#11).

**Required checks come from the loop configuration.** An absent list refuses the run instead of guessing commands from the repository. An explicitly empty list is a deliberate choice and is accepted.

## Risks / Trade-offs

- [A single spec grows as build steps add detail] → Later changes add a capability when one requirement needs a page of its own, instead of inflating `loop-workflow`.
- [Separate-context review with the same model may share blind spots] → Accepted. The user chooses models deliberately, and the loop validates that configuration is well formed, not that it is wise.
- [Leaving digests and record formats to later steps could let them grow back into a provenance framework] → Reviews and verdicts bounds them to what detecting a changed input needs.
- [Autonomous revision rounds can move the plan away from what the user saw] → The reviser may not change recorded decisions, and the final plan is in the delivered branch or pull request.
- [Minor fixes go unreviewed] → Accepted; required checks still run on implementation fixes, and #12 tracks a switch if it causes problems.
- [A `merge` delivery stops while the user has uncommitted edits in the checkout holding the default branch] → Accepted as loud. A scoping session that proposes outside that checkout is tracked in #14.
- [In `pr` mode, a proposal must reach the protected default branch through a pull request before it can run] → Accepted; plans reach a protected default branch the same way code does.
- [An unattended terminal run reports a failure without diagnosing it] → Accepted; the report names the cause and the transcripts, and automated diagnosis for unattended batches belongs to #13.
- [`local` leaves an unmerged branch with no remote copy] → Accepted. The user merges or pushes it as they choose.
- [`pr` ties one mode to GitHub] → Confined to that mode; `local` and `merge` need only Git.
