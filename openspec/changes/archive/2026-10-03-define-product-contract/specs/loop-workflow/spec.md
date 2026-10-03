## Purpose

The openspec-loop product contract: how a change proposed with the user becomes a reviewed, implemented, tested, archived and delivered result without further attention, and what the loop does and does not own along the way. The user attends only the proposal; everything after it runs unattended. openspec-loop is a simple, minimal harness: a lightweight assistant that runs one change and steps aside for the human, not a bulletproof enforcement system.

## ADDED Requirements

### Requirement: Minimal by design

Every mechanism, configuration option and guarantee in the loop SHALL serve a concrete delivery need. The loop SHALL NOT add speculative configuration, plugin points, extra layers, silent fallbacks, or gates and duplicate checks for work a person does by hand. When two designs both meet a need, the loop SHALL use the one with fewer moving parts.

#### Scenario: Manual work during a run
- **WHEN** a person edits or tests something by hand
- **THEN** verifying that work is the person's responsibility, and the loop adds no gate for it beyond its ordinary approval checks

### Requirement: Explicit enrollment

A run SHALL act only on the change named in `loop run`, and its responsibility SHALL cover only that change and the result it delivers. The loop SHALL refuse a run whose proposal is not committed on the run's base, as defined in Integration and delivery. OpenSpec artifacts, commits and native OpenSpec commands outside a run SHALL NOT enroll work, and the loop SHALL NOT enforce rules on them. The loop SHALL install no git hooks and SHALL NOT police repository-wide OpenSpec edits or archives.

#### Scenario: Run enrolls one change
- **WHEN** the user runs `loop run` with a change whose proposal is on the run's base
- **THEN** the loop starts a run owning that change and no other

#### Scenario: Proposal not on the default branch
- **WHEN** the user runs `loop run` with a change whose proposal is not committed on the run's base
- **THEN** the loop refuses the run and says where the proposal must be

#### Scenario: Native work outside a run
- **WHEN** someone creates, edits, archives or deletes an OpenSpec change outside any run
- **THEN** the loop neither blocks nor checks that work

### Requirement: Attended proposal

Proposals SHALL be native OpenSpec artifacts authored with the user through native OpenSpec proposing and committed on the default branch. The decisions the plan depends on SHALL be recorded in the design. The loop SHALL accept a committed proposal as it is.

#### Scenario: Proposal from native proposing
- **WHEN** the user writes a proposal with native `/opsx:propose` and commits it on the default branch
- **THEN** `loop run` accepts the change without further preparation

### Requirement: Controller ownership

After `loop run`, one deterministic controller SHALL decide every progression of the run: proposal review and revision, implementation, required checks, implementation review, integration, archival and delivery. Agents SHALL NOT decide progression. At most one advancement of a run SHALL be active at a time, and runs of different changes SHALL NOT share state. The loop's commands SHALL be its only interface: a supervising Claude or Codex session SHALL use the same commands as a person at a terminal, and the loop SHALL NOT depend on any session.

#### Scenario: Concurrent advancement refused
- **WHEN** a second advancement of a run starts while one is active
- **THEN** the controller refuses the second one and the first continues unaffected

#### Scenario: Supervised run
- **WHEN** a Claude or Codex session starts a run and the run stops
- **THEN** the session receives the same progress output and report a terminal would, and can continue the run with the same resume command once the user agrees

### Requirement: Supervision skill

The loop SHALL ship a skill for Claude and Codex that supervises a run through the loop's commands. The skill SHALL start the run, forward each progress line to the user as it arrives, and, when the run stops, investigate the cause with the user from the report, the transcripts, the review findings and the changes between attempts, including why attempts did not converge. The skill SHALL repair or resume only with the user's agreement.

#### Scenario: Progress forwarded
- **WHEN** a supervised run starts a step
- **THEN** the user sees that step's progress line in the session as it is printed

#### Scenario: Attempts did not converge
- **WHEN** a supervised run stops with exhausted implementation attempts
- **THEN** the skill explains from the findings and the changes between attempts why they did not converge, proposes a recovery and waits for the user

### Requirement: Independent roles

The configuration SHALL name three external roles independently: proposal reviewer, implementer and implementation reviewer. The implementer SHALL also revise the plan. The loop SHALL accept any role using the same harness or model as another role or as the user's session, and SHALL NOT detect or enforce the user's model. Every review SHALL run in a context separate from the context that produced the work under review. Configuration SHALL be refused only when it is malformed or names something that cannot be resolved.

#### Scenario: Same model in every role
- **WHEN** all three roles are configured with the same model
- **THEN** the run proceeds, and each review still runs in its own context

#### Scenario: Unresolvable role
- **WHEN** a role names a harness that cannot be found
- **THEN** the loop refuses to start the run and names the role

### Requirement: Reviews and verdicts

Each review SHALL end in a recorded `APPROVE` or `REVISE` verdict, and each finding SHALL be classified as blocking or minor. A blocking finding means the work fails the review's criteria; a minor finding has a local fix that cannot change behavior or a decision recorded in the design. A review with any blocking finding SHALL be `REVISE`, which requires revision followed by another review. A review with only minor findings SHALL be `APPROVE`: the implementer applies the minor fixes, the required checks run again for implementation, and the approval covers the result. Reviewers SHALL NOT modify the candidate they review. Each recorded verdict SHALL identify its reviewed inputs precisely enough to tell whether they changed afterward. The plan is the change's OpenSpec planning artifacts (proposal, design, spec deltas, tasks) excluding task completion marks. Proposal review SHALL judge whether the whole plan can be implemented and verified as one change without asking the user, and whether it keeps the decisions recorded in the design. An implementation approval covers the change's patch, not the base it applies to. Proposal approval SHALL start implementation automatically, after any minor plan fixes.

#### Scenario: Plan approved
- **WHEN** the proposal reviewer returns `APPROVE`
- **THEN** the controller starts implementation without further user action

#### Scenario: Only minor findings
- **WHEN** the implementation reviewer finds only minor issues
- **THEN** the verdict is `APPROVE`, the implementer applies the fixes, the required checks run again, and no further review follows

#### Scenario: Ticking a task box
- **WHEN** the implementer marks a task complete
- **THEN** the plan approval still applies

#### Scenario: Task instructions changed after approval
- **WHEN** approved task instructions change, other than by approved minor fixes
- **THEN** the plan needs another approving review before work under the changed tasks continues

### Requirement: Autonomous plan revision

Once a proposal is committed, revising its plan SHALL need no user. When proposal review returns `REVISE`, or the implementer finds that the approved plan needs a change, the implementer SHALL revise the plan in a fresh context and the plan SHALL return to proposal review. The reviser SHALL NOT change a decision recorded in the design. A finding or plan problem that needs a decision the plan does not record SHALL stop the run with the question; the user answers by recording the decision in the plan on the run's branch and resuming.

#### Scenario: Plan review requests changes
- **WHEN** the proposal reviewer returns `REVISE`
- **THEN** the implementer revises the plan and the plan is reviewed again, without the user

#### Scenario: Plan cannot be implemented as written
- **WHEN** the implementer finds that the approved plan needs a change
- **THEN** the implementer revises the plan, proposal review runs again, and implementation continues after approval

#### Scenario: Decision needed
- **WHEN** a finding can only be resolved by a decision the plan does not record
- **THEN** the run stops with the question, and after the user records the decision and resumes, the plan returns to proposal review

### Requirement: Implementation cycle

The controller SHALL run implementation as a cycle: implement, run the required checks, review the implementation, and revise as required. The required checks SHALL be the commands listed in the loop configuration. A missing list SHALL refuse the run; an explicitly empty list SHALL mean the run has no required checks. A check that runs and fails SHALL be a check result, not an execution failure: its output SHALL return to the implementer as findings for the next attempt, and implementation review SHALL wait until the checks pass. Implementation SHALL stay within the approved plan. Repairs SHALL be limited to failures the change caused; a failure the change did not cause SHALL NOT authorize unrelated or pre-existing repairs, so it persists until attempts run out.

#### Scenario: Change breaks a check
- **WHEN** a required check fails after implementation
- **THEN** the failure output returns to the implementer, and after the revision the checks run again before implementation review

#### Scenario: Pre-existing failure
- **WHEN** the same required-check failure also occurs on the base the change started from
- **THEN** the implementer does not expand the change to fix it, and the run stops when attempts run out

#### Scenario: No check list configured
- **WHEN** the loop configuration has no required check list
- **THEN** the loop refuses to start the run and says the list is missing

#### Scenario: Implementation review requests changes
- **WHEN** the implementation reviewer returns `REVISE`
- **THEN** the implementer revises, the required checks run again, and the implementation is reviewed again

### Requirement: Bounded attempts and execution failures

Proposal review and implementation SHALL each be bounded by a configured number of attempts. Each proposal review SHALL consume one proposal attempt. Each implementation round, meaning an implementer turn on the code with the checks and review that follow it and any approved minor fixes, SHALL consume one implementation attempt, whether it succeeds or ends in an execution failure. Reaching a bound with a standing `REVISE` or failing checks SHALL stop progression; a bound never approves work. Resuming a stage whose attempts are exhausted SHALL grant it a fresh budget, whatever stopped the run. An execution failure of a worker or the loop itself, such as a nonzero worker exit, a signal, a timeout or an unparseable reply, SHALL be reported as a failure distinct from review findings and check results, SHALL stop progression and SHALL NOT be retried automatically.

#### Scenario: Attempts exhausted
- **WHEN** the last allowed implementation attempt ends in `REVISE`
- **THEN** the run stops without archiving or delivering

#### Scenario: More attempts after exhaustion
- **WHEN** the user resumes a run whose implementation attempts ran out
- **THEN** implementation continues with a fresh attempt budget, starting from the last candidate and findings

#### Scenario: Worker crashes
- **WHEN** the implementer exits nonzero
- **THEN** the run stops, reports an execution failure rather than a rejection, and does not relaunch the implementer

### Requirement: Execution restrictions

Each external role SHALL run under the execution restrictions configured for it, such as sandboxing or permission limits. A role with no configured restrictions SHALL run with its harness's own defaults.

#### Scenario: Restricted reviewer
- **WHEN** the implementation reviewer is configured with a sandbox
- **THEN** the reviewer runs inside that sandbox while the implementer runs under its own configuration

### Requirement: Pre-archive gate and native archival

Before archiving, the controller SHALL check that every earlier stage is complete; an incomplete stage SHALL block archival and be named. Archival SHALL use native OpenSpec validation and archive. The expected archive effects, moving the change under the archive and applying its spec deltas to the main specs, SHALL NOT invalidate the approvals.

#### Scenario: Edit after implementation approval
- **WHEN** the change's patch changes after its implementation approval, other than by the approved minor fixes
- **THEN** the gate blocks archival

#### Scenario: Archive keeps approvals
- **WHEN** native archive moves the change and updates the main specs
- **THEN** the run's approvals remain valid for delivery

### Requirement: Integration and delivery

The run SHALL work on its own branch in its own worktree, started from its base, and SHALL preserve unrelated work in every checkout. The base is the remote's default branch in `pr` mode and the local default branch in `local` and `merge` modes. Before the pre-archive gate, the loop SHALL integrate the change with the current base; a conflict or a failed required check SHALL return to the implementer as findings. Only `merge` mode SHALL change the local default branch, and only by fast-forward when every checkout holding it is clean; otherwise the run SHALL stop and name the checkout. Before integrating in `merge` mode, the loop SHALL fast-forward a local default branch that is behind its remote, and SHALL stop the run when it is ahead or has diverged. Every action outside the run's worktree, such as updating or pushing a branch or opening a pull request, SHALL be reported as its own progress line. The configuration SHALL select one delivery mode: `local`, where the run stops with the archived change committed on its branch and pushes nothing; `pr`, where the loop pushes the change branch and opens a pull request on the repository's GitHub remote; or `merge`, where the loop fast-forwards the default branch to the change branch and pushes it. A failed fast-forward or a rejected push SHALL stop the run.

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
- **WHEN** the change integrates with a moved default branch without conflicts, its patch is unchanged and the required checks pass
- **THEN** the run continues to archival without another review

#### Scenario: Integration fails
- **WHEN** integration conflicts or a required check fails on the integrated result
- **THEN** the failure returns to the implementer as findings, and the fix is checked and reviewed before archival

#### Scenario: Default branch behind its remote
- **WHEN** in `merge` mode the local default branch is behind its remote and its checkout is clean
- **THEN** the loop fast-forwards it before integrating and reports the fast-forward as a progress line

#### Scenario: Dirty checkout
- **WHEN** the loop needs to change the default branch and a checkout holding it has uncommitted changes
- **THEN** the run stops before changing anything and names the checkout

#### Scenario: Unpushed commits on the default branch
- **WHEN** in `merge` mode the local default branch is ahead of its remote
- **THEN** the run stops instead of publishing those commits

### Requirement: Run control

The loop SHALL provide deterministic `run`, `status`, `stop` and `resume` commands. `run` SHALL exit with a report when the run completes or stops; a stop report SHALL name the step that stopped, the observed cause such as the verdict, check output or exit status, and the recovery available. The loop SHALL NOT investigate failures itself. Stop SHALL end the current step at once. Anything that blocks progression SHALL stop the run and report why, and a stopped run SHALL advance only on an explicit resume. A stage SHALL count as complete only while its result applies to the current inputs; an input change that invalidates an approval SHALL make that stage and every later stage incomplete again. Resume SHALL continue from the first incomplete stage without repeating complete ones. After an interruption around archival, merge, push or pull request creation, resume SHALL inspect the effects that actually happened and SHALL NOT replay them blindly.

#### Scenario: Resume after interrupted merge
- **WHEN** a run was interrupted after its merge completed and the user resumes it
- **THEN** the loop detects the completed merge and does not merge again

#### Scenario: Plan edited while stopped
- **WHEN** the plan changes while a run is stopped after implementation review, and the user resumes it
- **THEN** the run resumes at proposal review instead of archival

#### Scenario: Stop
- **WHEN** the user stops a run during an implementer turn
- **THEN** the turn ends, the run reports how to resume, and resume redoes the interrupted step

### Requirement: Progress and usage reporting

As the run proceeds, the loop SHALL print each step when it starts and when it ends, naming the stage and, for a worker step, the role and the role's harness and model. The end line SHALL add the outcome, such as the verdict with finding counts by severity, the check results or the failure, and, for a worker step, its usage and cost. Usage and cost SHALL be shown as the harness reports them; a value the harness does not report SHALL be shown as unavailable, not as zero. The loop SHALL keep every worker's transcript and SHALL name where it is in the report.

#### Scenario: Review step reported
- **WHEN** a proposal review ends in `REVISE`
- **THEN** the end line names the stage, the reviewer's harness and model, the verdict, the blocking and minor finding counts, and the review's usage and cost

#### Scenario: Harness reports no usage
- **WHEN** a harness reports no usage or cost for a step
- **THEN** that step's usage and cost are shown as unavailable instead of zero

#### Scenario: Worker fails
- **WHEN** a worker ends in an execution failure
- **THEN** the report names where that worker's transcript is
