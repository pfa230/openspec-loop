# loop-workflow Specification

## Purpose

This specification defines the openspec-loop product contract: proposal review, implementation, testing, integration, archival and delivery of a committed OpenSpec change. Proposal authoring is attended; execution runs unattended until completion or a stop requiring intervention. The loop owns one enrolled change and its delivery. Manual verification and repository-wide policy enforcement remain outside its responsibilities.

## Requirements

### Requirement: Minimal by design

Every mechanism, configuration option and guarantee in the loop SHALL serve a concrete delivery need. The loop SHALL NOT add speculative configuration, plugin points, extra layers, silent fallbacks, or gates and duplicate checks for work a person does by hand. When two designs both meet a need, the loop SHALL use the one with fewer moving parts.

#### Scenario: Manual work during a run
- **WHEN** a person edits or tests something by hand
- **THEN** verifying that work is the person's responsibility, and the loop adds no gate for it

### Requirement: Explicit enrollment

A run SHALL act only on the change named in `loop run` or an enrolling `loop step`, and its responsibility SHALL cover only that change and the result it delivers. The loop SHALL refuse a run whose proposal is not committed on the change's branch, as defined in Integration and delivery, and a run that would use the invoking worktree while it has uncommitted changes. OpenSpec artifacts, commits and native OpenSpec commands outside a run SHALL NOT enroll work, and the loop SHALL NOT enforce rules on them. The loop SHALL install no git hooks and SHALL NOT police repository-wide OpenSpec edits or archives.

#### Scenario: Run enrolls one change
- **WHEN** the user runs `loop run` with a change whose proposal is committed on the change's branch
- **THEN** the loop starts a run owning that change and no other

#### Scenario: Proposal not on the default branch
- **WHEN** the user runs `loop run` on the default branch with a change whose proposal is not committed there
- **THEN** the loop refuses the run and says where the proposal must be

#### Scenario: Proposal not on the change branch
- **WHEN** the user runs `loop run` on a branch other than the default branch with a change whose proposal is not committed on that branch
- **THEN** the loop refuses the run and says where the proposal must be

#### Scenario: Uncommitted changes in the worktree
- **WHEN** the user runs `loop run` on a branch other than the default branch and that worktree has uncommitted changes
- **THEN** the loop refuses the run and names the worktree

#### Scenario: Native work outside a run
- **WHEN** someone creates, edits, archives or deletes an OpenSpec change outside any run
- **THEN** the loop neither blocks nor checks that work

### Requirement: Attended proposal

Proposals SHALL be native OpenSpec artifacts authored with the user through native OpenSpec proposing and committed on the change's branch: on the default branch before the run branches from it, or on a branch of its own. The decisions the plan depends on SHALL be recorded in the design. The loop SHALL accept a committed proposal as it is.

#### Scenario: Proposal from native proposing
- **WHEN** the user writes a proposal with native `/opsx:propose`, commits it on the default branch and runs `loop run` there
- **THEN** `loop run` accepts the change without further preparation

#### Scenario: Proposal on its own branch
- **WHEN** the user proposes in a worktree on a branch of its own, commits the proposal there and runs `loop run` in that worktree
- **THEN** the run proceeds in that worktree without further preparation

### Requirement: Controller ownership

After enrollment through `loop run` or `loop step`, one deterministic controller SHALL decide every progression of the run: proposal review and revision, implementation, required checks, implementation review, integration, archival and delivery. Agents SHALL NOT decide progression. At most one advancement of a run SHALL be active at a time, and runs of different changes SHALL NOT share state. The loop's commands SHALL be its only interface: a supervising Claude or Codex session SHALL use the same commands as a person at a terminal, and the loop SHALL NOT depend on any session.

#### Scenario: Concurrent advancement refused
- **WHEN** a second advancement of a run starts while one is active
- **THEN** the controller refuses the second one and the first continues unaffected

#### Scenario: Supervised run
- **WHEN** a Claude or Codex session starts a run and the run stops
- **THEN** the session receives the same progress output and report a terminal would, and can continue the run with the same resume command once the user agrees

### Requirement: Supervision skill

The loop SHALL ship a skill for Claude and Codex that supervises a run through the loop's commands, including `step`. The skill SHALL start the run and forward each progress line to the user as it arrives. When the run completes, stops or returns control between stages, the skill SHALL show the user its report unchanged. When the run stops, the skill SHALL diagnose the stop with the user from the report, the transcripts, the failing agent's configured command, the review and check findings and the changes between attempts: the likely cause, the evidence that is missing, why attempts did not converge when they ran out, and a recovery. For an execution failure, the skill SHALL identify the specific failed operation and the evidence establishing it before proposing recovery; the stage, agent alias and exit status alone SHALL NOT constitute a causal diagnosis. When needed to distinguish a harness failure from an adapter's reply rejection, the skill SHALL inspect the invoked adapter and its relevant helper through targeted reads. For an execution failure, the diagnosis SHALL distinguish committed from uncommitted work and completed from pending validation using the available run records and Git evidence. When the evidence cannot establish a cause or part of that work state, the skill SHALL state that uncertainty rather than infer it from the exit status. The skill SHALL change nothing while diagnosing, and SHALL repair or continue only with the user's agreement. A successful stage boundary SHALL be presented for inspection without failure diagnosis or automatic continuation.

#### Scenario: Progress forwarded
- **WHEN** a supervised run starts a step
- **THEN** the user sees that step's progress line in the session as it is printed

#### Scenario: Report shown unchanged
- **WHEN** a supervised run completes or stops
- **THEN** the user sees the report in the session as the loop printed it

#### Scenario: Attempts did not converge
- **WHEN** a supervised run stops with exhausted implementation attempts
- **THEN** the skill explains from the findings and the changes between attempts why they did not converge, proposes a recovery and waits for the user

#### Scenario: Execution failure diagnosed
- **WHEN** a supervised run stops with an execution failure of a worker
- **THEN** the skill reads that worker's transcript and effective configured command, identifies the failed operation with supporting evidence, describes the work and validation left behind and any unresolved uncertainty, proposes a recovery only after that explanation, and waits for the user without changing anything

#### Scenario: Successful harness followed by adapter rejection
- **WHEN** a worker's transcript shows prose followed by JSON and a reply-parsing error, and the invoked wrapper establishes that its successful child returned before the wrapper rejected the final message
- **THEN** the supervisor explains that the child succeeded and the adapter failed while parsing the complete final-message text, cites the transcript and relevant wrapper behavior, and distinguishes that failure from a child-process crash before proposing recovery
- **AND** copying the report with only its stage, agent alias and exit status does not satisfy the diagnosis

#### Scenario: Work survives a rejected final reply
- **WHEN** a reply rejection leaves implementation edits uncommitted, the transcript records worker-run checks, and the loop has not completed its own required checks or review for that attempt
- **THEN** the supervisor reports that the edits remain in the worktree, identifies their uncommitted status and the distinction between recorded worker checks and pending loop validation, and does not describe the work as lost or fully reviewed

#### Scenario: Evidence does not establish the underlying cause
- **WHEN** the available evidence establishes malformed reply rejection but does not establish why the model produced that reply, or the invoked adapter cannot be inspected sufficiently to establish its child outcome
- **THEN** the supervisor states the specific limit, does not invent a model, authentication, quota, network or compiler cause, and does not rerun or modify the failed run to test a theory

### Requirement: Independent roles

The configuration SHALL define agents, each an alias for a command that implements the worker interface, and SHALL assign an agent to each of four roles independently: proposal reviewer, plan reviser, implementer and implementation reviewer. The plan reviser SHALL revise the plan and apply minor plan fixes. The loop SHALL accept any role using the same agent, harness or model as another role or as the user's session, and SHALL NOT detect or enforce the user's model. Every review SHALL run in a context separate from the context that produced the work under review. Configuration SHALL be refused only when it is malformed, assigns a role an alias it does not define, or assigns a role an agent whose command cannot be found; an agent no role uses is not resolved.

#### Scenario: Same model in every role
- **WHEN** every role is assigned the same agent, or agents with the same model
- **THEN** the run proceeds, and each review still runs in its own context

#### Scenario: Two models of one harness
- **WHEN** the configuration defines `opus` and `fable` as two agents of the same harness with different models, and assigns them to different roles
- **THEN** each role runs its own agent's model

#### Scenario: Unresolvable role
- **WHEN** a role is assigned an alias the configuration does not define, or an agent whose command cannot be found
- **THEN** the loop refuses to start the run and names the role and the alias

### Requirement: Reviews and verdicts

Each review SHALL end in a recorded `APPROVE` or `REVISE` verdict, and each finding SHALL be classified as blocking or minor. The reviewer SHALL classify the findings, and the loop SHALL derive the verdict from them. A blocking finding means the work fails the review's criteria; a minor finding has a local fix that cannot change behavior or a decision recorded in the design. A review with any blocking finding SHALL be `REVISE`, which requires revision followed by another review. A review with only minor findings SHALL be `APPROVE`: the plan reviser applies minor plan fixes and the implementer applies minor implementation fixes, the required checks run again for implementation, and the approval covers the result. Reviewers SHALL NOT modify the candidate they review. The plan is the change's OpenSpec planning artifacts (proposal, design, spec deltas, tasks) excluding task completion marks. Proposal review SHALL judge whether the whole plan can be implemented and verified as one change without asking the user, whether it keeps the decisions recorded in the design, and whether it follows the repository's rules for change content. The repository's rules for change content are the rules its instructions for agents, such as `AGENTS.md`, set for what a change contains; a rule for how an agent works or reports is not one of them. The change's patch is its difference from the commit it branches from on the base, outside the change's directory `openspec/changes/<change>/`, so it holds no part of the plan or its task completion marks. An implementation approval covers the change's patch, not the base it applies to. Proposal approval SHALL start implementation automatically, after any minor plan fixes, during ordinary advancement; `loop step` SHALL instead return control after proposal review completes.

#### Scenario: Plan approved
- **WHEN** the proposal reviewer returns `APPROVE` during ordinary advancement
- **THEN** the controller starts implementation without further user action

#### Scenario: Verdict follows the findings
- **WHEN** a reviewer reports one blocking finding among several minor ones
- **THEN** the recorded verdict is `REVISE`

#### Scenario: Only minor plan findings
- **WHEN** the proposal reviewer finds only minor issues during ordinary advancement
- **THEN** the verdict is `APPROVE`, the plan reviser applies the fixes, and implementation starts without another proposal review

#### Scenario: Only minor findings
- **WHEN** the implementation reviewer finds only minor issues
- **THEN** the verdict is `APPROVE`, the implementer applies the fixes, the required checks run again, and no further review follows

#### Scenario: Plan revised before implementation
- **WHEN** the plan was revised or given minor plan fixes on the change's branch, and the implementation reviewer reviews a candidate
- **THEN** the patch it reviews holds none of those plan changes, and the run completes as it would without them

#### Scenario: Ticking a task box
- **WHEN** the implementer marks a task complete
- **THEN** the plan is unchanged and implementation continues under its approval

#### Scenario: Task instructions changed after approval
- **WHEN** an implementer turn changes approved task instructions or any other part of the plan
- **THEN** the run stops at implementation, names the turn's commit, and does not return to proposal review

#### Scenario: Plan breaks a repository rule
- **WHEN** the repository's instructions for agents require minimal designs and the plan adds a mechanism no requirement needs
- **THEN** the proposal reviewer reports a blocking finding and the verdict is `REVISE`

#### Scenario: Rule for how an agent works
- **WHEN** the repository's instructions for agents require an agent to present a summary after editing, and the plan contains no such summary
- **THEN** the proposal reviewer reports no finding on that rule

### Requirement: Autonomous plan revision

Once a proposal is committed, revising its plan SHALL need no user. When proposal review returns `REVISE`, or the implementer finds that the approved plan needs a change, the plan reviser SHALL revise the plan in a fresh context and the plan SHALL return to proposal review. The implementer SHALL report a needed plan change instead of making it, and an implementer turn that changes the plan SHALL stop the run as a failure of the implementer; the loop compares the plan before and after each turn, so a turn interrupted before it ends is not checked. The reviser SHALL NOT change a decision recorded in the design. A finding or plan problem that needs a decision the plan does not record SHALL stop the run with the question; the user answers by recording the decision in the plan on the run's branch and resuming. A reviewer SHALL raise such a decision as a question on its finding, and any finding with a question SHALL stop the run before the plan is revised.

#### Scenario: Plan review requests changes
- **WHEN** the proposal reviewer returns `REVISE`
- **THEN** the plan reviser revises the plan and the plan is reviewed again, without the user

#### Scenario: Plan cannot be implemented as written
- **WHEN** during ordinary advancement the implementer finds that the approved plan needs a change
- **THEN** the plan reviser revises the plan, proposal review runs again, and implementation continues after approval

#### Scenario: Decision needed
- **WHEN** a review finding carries a question for a decision the plan does not record
- **THEN** the run stops with the question without revising the plan, and after the user records the decision and resumes, the plan returns to proposal review

### Requirement: Implementation cycle

The controller SHALL run implementation as a cycle: implement, run the required checks, review the implementation, and revise as required. The implementer SHALL work from the change's native OpenSpec apply instructions, including the apply guidance the repository's OpenSpec configuration sets. The required checks SHALL be the commands listed in the loop configuration. A missing list SHALL refuse the run; an explicitly empty list SHALL mean the run has no required checks. A check that runs and fails SHALL be a check result, not an execution failure: its output SHALL return to the implementer as findings for the next attempt, and implementation review SHALL wait until the checks pass. When the checks fail after approved minor implementation fixes, the approval SHALL lapse and the failure SHALL return to the implementer as for any failed check. Implementation review SHALL judge whether the change's patch implements the whole approved plan, stays within it, keeps the decisions recorded in the design, and follows the repository's rules for change content. Implementation SHALL stay within the approved plan. Repairs SHALL be limited to failures the change caused; a failure the change did not cause SHALL NOT authorize unrelated or pre-existing repairs, so it persists until attempts run out.

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

#### Scenario: Minor fixes break a check
- **WHEN** the implementation reviewer returns `APPROVE` with minor findings and a required check fails after the implementer applies them
- **THEN** the approval lapses, the failure output returns to the implementer in the next attempt, and that attempt's patch is reviewed again after the checks pass

#### Scenario: Repository apply guidance
- **WHEN** the repository's OpenSpec configuration sets apply guidance
- **THEN** the implementer's instructions include that guidance

#### Scenario: Patch breaks a repository rule
- **WHEN** the repository's instructions for agents forbid speculative configuration and the patch adds an option no requirement needs
- **THEN** the implementation reviewer reports a blocking finding and the implementer revises

### Requirement: Bounded attempts and execution failures

Proposal review and implementation SHALL each be bounded by a configured number of attempts. Each proposal review SHALL consume one proposal attempt. Each implementation round, meaning an implementer turn on the code with the checks and review that follow it and any approved minor fixes, SHALL consume one implementation attempt, whether it succeeds or ends in an execution failure. Reaching a bound with a standing `REVISE` or failing checks SHALL stop progression; a bound never approves work. Every resume or `loop step` invocation SHALL grant each bounded stage it runs a fresh budget, whatever stopped the run; `loop resume` SHALL accept an attempt count that replaces the configured budgets for that resume. An execution failure of a worker or the loop itself, such as a nonzero worker exit, a signal, a timeout or a missing or malformed reply, SHALL be reported as a failure distinct from review findings and check results, SHALL stop progression and SHALL NOT be retried automatically.

#### Scenario: Attempts exhausted
- **WHEN** the last allowed implementation attempt ends in `REVISE`
- **THEN** the run stops without archiving or delivering

#### Scenario: Proposal attempts exhausted
- **WHEN** the last allowed proposal review returns `REVISE`
- **THEN** the run stops at proposal review with that review's findings, and implementation does not start

#### Scenario: More attempts after exhaustion
- **WHEN** the user resumes a run whose implementation attempts ran out
- **THEN** implementation continues with a fresh attempt budget, starting from the last candidate and findings

#### Scenario: Resume with one attempt
- **WHEN** the user resumes a run stopped at proposal review with `loop resume <change> --attempts 1`, and the review returns `REVISE`
- **THEN** the run stops after that one review, whatever the configured budget

#### Scenario: Worker crashes
- **WHEN** the implementer exits nonzero
- **THEN** the run stops, reports an execution failure rather than a rejection, and does not relaunch the implementer

### Requirement: Execution restrictions

Each external role SHALL run under the execution restrictions configured for it, such as sandboxing or permission limits. An agent's restrictions SHALL be part of its command, as harness arguments or as a wrapping command. An agent whose command adds no restrictions SHALL run with its harness's own defaults.

#### Scenario: Restricted reviewer
- **WHEN** the implementation reviewer's agent runs its adapter inside a sandbox wrapper
- **THEN** the reviewer runs inside that sandbox while the implementer runs under its own agent's command

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

### Requirement: Run control

The loop SHALL provide deterministic `run`, `step`, `status`, `stop` and `resume` commands. `run` SHALL exit with a report when the run completes or stops; a stop report SHALL name the step that stopped, the observed cause such as the verdict, check output or exit status, and the recovery available. The loop SHALL NOT investigate failures itself. Stop SHALL end the current step at once. Anything that blocks progression SHALL stop the run and report why, and a stopped run SHALL advance only on an explicit `resume` or `step`. Resume and `loop step` SHALL continue from the first incomplete stage without repeating complete ones. Ordinary run and resume SHALL continue until completion or a stop. `loop step` SHALL use the same interruption recovery and takeover rules as resume. `loop resume <change> --implement` SHALL first make implementation and every later stage incomplete, so the implementer implements the plan as it stands on the run's branch, from the work already there; it SHALL leave proposal review as it is, and the loop SHALL NOT detect plan edits or reopen implementation for them itself. Once the change is archived, `--implement` SHALL refuse and leave the run as it was. After an interruption around archival, merge, push or pull request creation, resume SHALL inspect the effects that actually happened and SHALL NOT replay them blindly. Resume SHALL NOT take over a run while the step its dead advancing process started is still running: it SHALL refuse, name that step's process group and the dead process, and leave the run as it was. Resume SHALL NOT end that step itself. The loop records each step's process group as the step starts, so a process that dies before recording it leaves that step unchecked.

#### Scenario: Resume after interrupted merge
- **WHEN** a run was interrupted after its merge completed and the user resumes it
- **THEN** the loop detects the completed merge and does not merge again

#### Scenario: Resume after interrupted archival
- **WHEN** a run was interrupted after OpenSpec archived the change but before the loop committed the result, and the user resumes it
- **THEN** the loop commits the archived change without running OpenSpec's archive again

#### Scenario: Resume after the pull request opened
- **WHEN** a run was interrupted after its pull request opened and the user resumes it
- **THEN** the loop reports the open pull request and does not open another

#### Scenario: Plan edited while stopped
- **WHEN** a person changes the plan while a run is stopped after implementation completed, and resumes it
- **THEN** the run resumes where it stopped without reviewing the plan again

#### Scenario: Implementation reopened after a plan edit
- **WHEN** a person commits a plan change on the run's branch while the run is stopped after implementation completed, and runs `loop resume <change> --implement`
- **THEN** the implementer implements the edited plan from the work already on the branch, the required checks and implementation review run again, the run continues through integration, and the plan is not reviewed again

#### Scenario: Implementation reopened before plan approval
- **WHEN** a run stopped at proposal review is resumed with `--implement`
- **THEN** the plan is reviewed before the implementer runs

#### Scenario: Implementation reopened after archival
- **WHEN** the user runs `loop resume <change> --implement` for a run whose change is archived
- **THEN** the loop refuses, says the change is archived, and leaves the run as it was

#### Scenario: Stop
- **WHEN** the user stops a run during an implementer turn
- **THEN** the turn ends, the run reports how to resume, and resume redoes the interrupted step

#### Scenario: Run already exists
- **WHEN** the user runs `loop run` for a change that already has a run
- **THEN** the loop refuses and names `loop status` and `loop resume` for that run

#### Scenario: Advancing process died
- **WHEN** the process advancing a run dies without stopping the run, its step has ended, and the user resumes it
- **THEN** the loop takes over the run and treats the step that was in progress as interrupted

#### Scenario: Step outlives its advancing process
- **WHEN** the process advancing a run is killed with SIGKILL during a step, the step keeps running, and the user resumes the run
- **THEN** the loop refuses, names the step's process group and the dead process, and starts no step; once that group has exited, resume takes the run over

### Requirement: Progress and usage reporting

As the run proceeds, the loop SHALL print each step when it starts and when it ends, naming the stage and, for a worker step, the alias of the agent that runs it. The end line SHALL add the outcome, such as the verdict with finding counts by severity, the check results or the failure, and, for a worker step, its usage and cost, including a worker step that ends in an execution failure. The usage SHALL be shown in the same form for every harness: input tokens, output tokens and cost in US dollars, rounded to cents, without estimation or conversion. A value the usage file does not report SHALL be shown as unavailable, not as zero; when it reports none of them, the usage SHALL be shown as unavailable as a whole. Native harness counters SHALL NOT appear in the progress output; they remain in the step's transcript. The completed, stopped and successful stage-boundary reports SHALL total usage and cost by role over every worker step of the run, across every advancement, and SHALL say how many of a role's steps reported no usage. Input tokens, output tokens and cost SHALL each be totaled over the steps that reported it, and shown as unavailable when no step did. When some of a role's steps reported a cost, the report SHALL say how many reported none; when none did, the role's cost SHALL be shown as unavailable. A stop for a worker's execution failure SHALL name the step, the agent and its transcript. The loop SHALL keep every worker's transcript and SHALL name where it is in the report.

#### Scenario: Review step reported
- **WHEN** a proposal review ends in `REVISE`
- **THEN** the end line names the stage, the reviewer's agent alias, the verdict, the blocking and minor finding counts, and the review's usage and cost

#### Scenario: Harness reports no usage
- **WHEN** a harness reports no usage or cost for a step
- **THEN** that step's usage and cost are shown as unavailable instead of zero

#### Scenario: Harness reports tokens only
- **WHEN** a harness reports token counts but no cost for a step
- **THEN** the end line shows the token counts as reported and the cost as unavailable

#### Scenario: Worker fails
- **WHEN** a worker ends in an execution failure
- **THEN** the report names the step, the agent and where that worker's transcript is, and the end line shows any usage the worker reported before it failed

#### Scenario: Totals across attempts and resumes
- **WHEN** a run stops after its implementation attempts run out, is resumed, and completes
- **THEN** the completed report totals each role's usage and cost over every worker step of both advancements, names how many of each role's steps reported no usage, and, for a role with only some steps reporting a cost, how many reported none

#### Scenario: Additional reported counters
- **WHEN** a Claude Code step and a Codex step each end with reported usage
- **THEN** both end lines show input tokens, output tokens and cost in the same form, such as `input 332,936, output 2,234, cost $0.57` and `input 16,641, output 59, cost unavailable`
- **AND** neither shows a native counter such as `cache_read_input_tokens` or `reasoning_output_tokens`

#### Scenario: Explicit zero and absent cost
- **WHEN** a worker reports zero output tokens and no cost
- **THEN** the output appears as zero and the cost appears as unavailable

### Requirement: OpenSpec CLI

The loop SHALL run OpenSpec through the `openspec` command on PATH, the same CLI the user runs by hand, and SHALL work with the repository's native OpenSpec setup without installing a custom schema. When `loop run`, `loop resume` or `loop step` starts, the loop SHALL refuse if `openspec` is missing or older than 1.14.0, naming the version found and the minimum. The loop SHALL set no upper version bound.

#### Scenario: OpenSpec too old
- **WHEN** the `openspec` on PATH reports version 1.9.0 and the user runs `loop run`
- **THEN** the loop refuses the run and names 1.9.0 and the minimum 1.14.0

#### Scenario: OpenSpec missing
- **WHEN** no `openspec` command is on PATH and the user runs `loop run`
- **THEN** the loop refuses the run and says `openspec` was not found

#### Scenario: Newer OpenSpec
- **WHEN** the `openspec` on PATH reports a version above 1.14.0, including a new major version
- **THEN** the loop runs with it without a version refusal

#### Scenario: Native setup only
- **WHEN** a repository has only native OpenSpec setup with its default schema
- **THEN** `loop run` needs no loop-specific schema or OpenSpec configuration

### Requirement: Loop configuration

The loop SHALL read `openspec/loop.yaml` from the invoking checkout on every `loop run`, `loop resume` and `loop step`. It SHALL then apply `openspec/loop.local.yaml` from the clone's main checkout when present, followed by that file from the invoking checkout when present and distinct. The main checkout SHALL be Git's primary working tree, independently of its checked-out branch or the configured default branch. A clone initialized as bare has no main checkout and SHALL use only the invoking checkout's local file. If a non-bare clone's main checkout cannot be located or accessed, the command SHALL refuse and name the problem rather than omit its overrides. Each later file SHALL replace settings from earlier files: a top-level setting as a whole, and `agents`, `roles` and `attempts` entry by entry. Each existing file SHALL be validated independently before merging; required fields SHALL be checked after all applicable files are combined. The configuration SHALL name the default branch, and the loop SHALL take it from the configuration and SHALL NOT detect it. The configuration SHALL name the worktrees directory, under which enrollment through `loop run` or `loop step` on the default branch creates the change's worktree at `<directory>/<change>`. A relative worktrees directory SHALL resolve against the checkout where enrollment through `loop run` or `loop step` is requested, and an absolute one SHALL be used as given. A run SHALL keep the worktree it was created with. The loop SHALL NOT change Git's ignore files or configuration. A missing `openspec/loop.yaml`, unparseable YAML, an unknown key or a value of the wrong type in any applicable file SHALL refuse the command and name the problem and the file. A required field missing after the files are combined SHALL refuse the command and name the field.

#### Scenario: Configuration missing
- **WHEN** the user runs `loop run` in a checkout without `openspec/loop.yaml`
- **THEN** the loop refuses the run and names the missing file

#### Scenario: Unknown key
- **WHEN** the configuration contains a key the loop does not know, such as a misspelled field name
- **THEN** the loop refuses the command and names the key

#### Scenario: Configured default branch
- **WHEN** the configuration names `trunk` as the default branch and the user runs `loop run` on `trunk`
- **THEN** the loop creates the change's branch from `trunk`, whatever the remote's HEAD points to

#### Scenario: Configuration changed while stopped
- **WHEN** the user edits the configuration while a run is stopped and then resumes it
- **THEN** the resumed run uses the edited configuration

#### Scenario: Local override
- **WHEN** `openspec/loop.local.yaml` defines an agent and assigns it to the proposal reviewer, and the committed file assigns another agent to that role and defines the plan reviser
- **THEN** the proposal reviewer uses the local agent and the plan reviser keeps the committed assignment

#### Scenario: Relative worktrees directory
- **WHEN** the configuration names `.worktrees` as the worktrees directory and the user runs `loop run` on the default branch
- **THEN** the loop creates the change's worktree at `.worktrees/<change>` under the checkout where `loop run` was given

#### Scenario: Absolute worktrees directory
- **WHEN** the configuration names an absolute worktrees directory outside the repository and the user runs `loop run` on the default branch
- **THEN** the loop creates the change's worktree at `<directory>/<change>`

#### Scenario: Worktrees directory changed while stopped
- **WHEN** the user changes the worktrees directory while a run is stopped and then resumes it
- **THEN** the resumed run continues in the worktree it was created with

#### Scenario: Worktrees directory not ignored
- **WHEN** the worktrees directory lies inside the invoking checkout and Git does not ignore it, and the user runs `loop run` on the default branch
- **THEN** the loop creates the change's worktree without changing any Git ignore file or configuration, and the checkout shows it as untracked

#### Scenario: Fresh issue worktree inherits shared overrides
- **WHEN** a committed change is run or enrolled through step in a fresh linked issue worktree without a local file, and the main checkout's ignored local file defines agents, roles, checks, delivery and attempt overrides
- **THEN** the run uses those overrides without requiring a copy or symlink in the issue worktree

#### Scenario: Invoking worktree retains its committed settings
- **WHEN** the invoking worktree's committed configuration differs from the main checkout's committed configuration and the main checkout supplies local overrides
- **THEN** the loop combines the invoking worktree's committed settings with the shared overrides and does not read the main checkout's committed configuration

#### Scenario: Worktree overrides take precedence
- **WHEN** the main checkout's local file defines multiple settings and the invoking worktree's local file sets only one agent, role, attempt budget or top-level setting
- **THEN** the invoking worktree's entries win and other shared entries remain; a top-level setting such as checks is replaced as a whole

#### Scenario: Shared configuration reread from another worktree
- **WHEN** the user edits the main checkout's local file between advancements and continues through resume or step from a linked worktree
- **THEN** the continuation uses the edited shared settings and retains the run's recorded worktree

#### Scenario: Shared file missing
- **WHEN** the main checkout is accessible but has no local file
- **THEN** the loop uses the invoking checkout's committed configuration and any invoking-worktree local overrides

#### Scenario: Invalid shared configuration cannot be masked
- **WHEN** a shared local file is unreadable or contains invalid YAML, an unknown key or a wrong type, even if the invoking worktree overrides the offending setting
- **THEN** the command refuses before advancing and names the shared file's actual path and problem

#### Scenario: Main checkout uses another branch
- **WHEN** the main checkout is detached or holds another branch, while the configured default branch is checked out elsewhere or nowhere
- **THEN** the shared overrides still come from the primary checkout's local file

#### Scenario: Main checkout cannot be located
- **WHEN** a linked worktree belongs to a non-bare clone whose primary checkout cannot be located or accessed
- **THEN** the loop refuses with the location problem instead of continuing with different configuration

#### Scenario: Bare clone has no shared main checkout
- **WHEN** the invoking checkout is a linked worktree of a clone initialized as bare
- **THEN** the loop reads the invoking checkout's committed configuration and optional local file without inventing a main checkout

### Requirement: Worker interface

The loop SHALL run an agent by appending four paths to the agent's command: a prompt file, a JSON schema file, a reply file and a usage file. The command SHALL run in the run's worktree with no input and with the `SHELL` environment variable set to `bash`, and its output SHALL be kept as the step's transcript. The step SHALL succeed only when the command exits 0 and the reply file holds a JSON object that matches the schema; anything else SHALL be an execution failure. The command MAY write the step's usage to the usage file as a JSON object with optional `inputTokens`, every prompt token the model processed whether or not it was cached, optional `outputTokens`, every token the model generated including reasoning, and optional `costUsd`, a cost in US dollars, each a finite non-negative number. A command that writes no usage file reports no usage. A usage file that is not such an object SHALL be an execution failure.

#### Scenario: Custom worker command
- **WHEN** an agent's command is a script that reads the prompt and writes a reply that matches the schema
- **THEN** the loop uses that reply as it would a shipped adapter's

#### Scenario: Malformed reply
- **WHEN** a worker exits 0 but its reply file is missing, is not JSON, or holds an object that does not match the schema
- **THEN** the run stops with an execution failure and the report names the transcript and the reply file

#### Scenario: Worker writes no usage
- **WHEN** a worker exits 0 with a valid reply and writes no usage file
- **THEN** the step succeeds and its usage and cost are shown as unavailable

#### Scenario: Malformed usage
- **WHEN** a worker exits 0 with a valid reply but its usage file is not JSON, holds a key other than `inputTokens`, `outputTokens` and `costUsd`, such as the former `tokens` map, or holds a value that is not a finite non-negative number
- **THEN** the run stops with an execution failure that names the usage file

#### Scenario: Custom worker supplies additional counters
- **WHEN** a custom worker writes `inputTokens`, `outputTokens` and `costUsd`
- **THEN** the loop accepts and reports them as it would a shipped adapter's usage

#### Scenario: Worker shell is bash
- **WHEN** the loop starts a worker while the inherited `SHELL` names another shell, such as zsh
- **THEN** the worker's `SHELL` is `bash`, so a harness that selects its shell from `SHELL` runs model-written commands in bash

### Requirement: Shipped adapters

The loop SHALL ship worker commands for Claude Code, Codex, Antigravity and OpenCode. Each SHALL run its harness headless in the run's worktree and SHALL write the harness's final answer as the reply. Claude Code, Codex and Antigravity SHALL pass the agent's remaining arguments to the harness. OpenCode SHALL preserve model (`-m`/`--model`), agent, variant, explicit `--auto` permission approval and pure-mode selections through its supported API/server options, and SHALL name and reject unsupported arguments before starting the harness. Claude Code, Codex and Antigravity SHALL use their harness's own schema enforcement. The OpenCode adapter SHALL own one local harness process for one worker prompt, terminate it when the worker completes, fails or is interrupted, and SHALL offer the model a reply tool whose arguments are the supplied worker schema's properties, without forcing a tool choice, and SHALL write the arguments of the root session's last completed reply-tool call as its reply, without parsing text messages for a reply. The reply tool SHALL reject a call that omits a required top-level property of the worker schema with an error naming the missing properties; such a call SHALL NOT complete and SHALL NOT supply the reply, and its error SHALL reach the model within its turn. The loop's reply validation SHALL be the check of the written arguments. Supplying that tool SHALL be scoped to the worker process, preserve existing configuration and restrictions, and require no persistent configuration edits. OpenCode SHALL retain headless denial of questions and plan-mode transitions, reject permission requests unless explicit auto approval is enabled, and preserve configured denies for both root and delegated sessions. Settings or arguments that cannot be honored SHALL fail explicitly rather than be discarded or weaken restrictions. An otherwise successful OpenCode prompt without a root reply-tool call SHALL be reported as a missing reply even when text contains a schema-conforming object. API or session errors and unexpected harness exits SHALL be execution failures; an unexpected nonzero harness exit SHALL preserve its status and reported usage. Expected shutdown of an owned server after a completed prompt SHALL NOT turn that prompt into a harness failure. The adapter SHALL NOT repair text or launch another worker turn. Each adapter SHALL write its harness's reported usage to the usage file as input tokens, output tokens and any explicitly reported USD cost before it judges the harness's exit. It SHALL derive each token total by adding the native fields that, under that harness's counting rules, make up all prompt tokens or all generated tokens, so that cached prompt tokens count once as input and reasoning tokens count once as output. It SHALL write a total only when the harness reported at least one of its fields, and SHALL write no cost the harness does not report. A negative or nonfinite native value SHALL make the written total or cost invalid for existing worker validation; other fields or model steps SHALL NOT cancel or hide it. An adapter SHALL preserve its harness's final-summary or per-step accounting boundary, without adding repeated cumulative snapshots together. Usage collection SHALL use the existing worker invocation's output, including its subscribed OpenCode event stream, and SHALL NOT add an auxiliary command, API lookup, pricing calculation or inference run. The harness's native usage SHALL remain in the transcript.

#### Scenario: Harness arguments pass through
- **WHEN** the proposal reviewer's agent is `loop-codex` with a model and a sandbox argument
- **THEN** Codex runs with that model and sandbox, and its schema-conforming answer reaches the loop as the reply

#### Scenario: OpenCode cut report stays out of the reply
- **WHEN** a successful OpenCode turn emits a required cut report as text and calls the reply tool with arguments matching the worker schema
- **THEN** the adapter writes only those arguments as the reply and keeps the cut report in the transcript
- **AND** the loop can continue its existing commit, required-check and review sequence

#### Scenario: Harness without schema enforcement
- **WHEN** OpenCode's prompt completes without an API/session error or a root reply-tool call, with optional text such as prose followed by JSON, a fenced JSON block or bare JSON
- **THEN** the adapter reports a missing reply, writes no reply and the run stops with an execution failure
- **AND** the transcript distinguishes the completed OpenCode prompt from the adapter's missing-reply failure and the worker's implementation edits remain available for resume

#### Scenario: Per-worker schema and inherited settings
- **WHEN** an OpenCode worker starts with a supplied schema and existing user or project configuration, including inline configuration
- **THEN** the worker's reply tool takes that schema's properties, its configured model, agent, restrictions and unrelated settings are preserved, and no user or project configuration file is changed
- **AND** a reply-tool call from a delegated session does not supply the reply

#### Scenario: Unsupported OpenCode arguments
- **WHEN** an OpenCode worker command supplies an unsupported argument, such as `--attach`, `--session`, `--continue`, `--command` or `--dir`
- **THEN** the adapter names that argument and fails before starting the harness rather than silently changing the session, directory, restrictions or reply protocol

#### Scenario: Pure OpenCode still enforces its schema
- **WHEN** pure mode is enabled through a supported argument or the environment
- **THEN** OpenCode retains pure-mode behavior and the worker can still reply through the reply tool, whose arguments the loop checks against the schema

#### Scenario: Provider that accepts only automatic tool choice
- **WHEN** the worker's model is served by a provider that rejects forced tool choices, such as Meta's Muse Spark
- **THEN** the worker prompt carries no forced tool choice and the root session's reply-tool call supplies the reply

#### Scenario: Reply-tool call missing a required property
- **WHEN** the root session calls the reply tool with arguments that omit a required property of the worker schema, such as an empty call for a schema that requires `planProblem`
- **THEN** the tool returns an error naming the missing properties to the model, and that call does not supply the reply
- **AND** a later complete reply-tool call in the same turn supplies the reply, while a turn that ends without one is reported as a missing reply

#### Scenario: Reply-tool arguments that break the schema
- **WHEN** the root session calls the reply tool with every required property of the worker schema but a value the schema does not allow
- **THEN** the adapter writes those arguments as the reply and the loop's reply validation rejects them as an execution failure

#### Scenario: Inherited OpenCode configuration directory
- **WHEN** an OpenCode worker starts with `OPENCODE_CONFIG_DIR` set in its environment
- **THEN** the adapter names that setting and fails before starting the harness rather than displacing the configuration it selects

#### Scenario: Headless OpenCode permission behavior
- **WHEN** OpenCode asks for a permission in the worker's root or delegated session
- **THEN** the adapter rejects the request by default or approves it once when explicit `--auto` is enabled, without overriding configured denies
- **AND** questions and plan-mode transitions remain denied

#### Scenario: Owned OpenCode lifecycle
- **WHEN** an OpenCode prompt succeeds, fails, or the worker is interrupted
- **THEN** the adapter leaves no owned server or event subscription running and preserves worker edits
- **AND** a startup failure, unexpected harness exit or premature event-stream closure is an execution failure with any usage already reported preserved

#### Scenario: Harness without cost
- **WHEN** Codex reports token counts and no cost for a turn
- **THEN** `loop-codex` writes its input and output totals and no cost to the usage file

#### Scenario: Harness fails after reporting usage
- **WHEN** a harness reports usage and then exits nonzero
- **THEN** the adapter writes that usage to the usage file and exits with the harness's status

#### Scenario: Complete usage from every shipped backend
- **WHEN** Claude Code reports `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens` and `output_tokens`, Codex reports `input_tokens`, `cached_input_tokens`, `output_tokens` and `reasoning_output_tokens`, Antigravity reports `input_tokens`, `cache_read_tokens`, `output_tokens` and `thinking_tokens`, or OpenCode reports `input`, `cache.read`, `cache.write`, `output` and `reasoning`
- **THEN** its adapter writes input tokens that count each cached prompt token once and output tokens that count each reasoning token once, under that harness's counting rules
- **AND** it includes an explicitly reported USD cost and leaves an unreported cost absent
- **AND** it launches only the existing worker harness invocation

#### Scenario: Backend accounting boundaries
- **WHEN** a backend emits several cumulative final-summary snapshots or OpenCode emits several model-step usage records and repeated updates of the same record
- **THEN** the adapter uses the final applicable summary for a summary-reporting backend and sums corresponding counters and reported cost once per OpenCode model step using the latest report for that step
- **AND** it does not add a cumulative summary to the usage that summary already includes

#### Scenario: Numeric nested usage and metadata
- **WHEN** a usage object contains nested counters, an array of per-iteration breakdowns, request counts and metadata such as a service-tier string
- **THEN** the adapter writes only the input and output totals and any reported cost to the usage file
- **AND** the full native usage, including those counters and metadata, stays in the transcript

#### Scenario: Invalid collected quantity
- **WHEN** a harness reports a negative or nonfinite value in a field of a token total or in its cost
- **THEN** the usage file holds an invalid value for that total or cost and existing malformed-usage validation makes the worker step an execution failure
- **AND** the adapter does not silently remove the value or let another field offset it

#### Scenario: Distinct OpenCode steps cannot cancel a negative counter
- **WHEN** the latest reports for two distinct OpenCode model steps contain `output` values of -1 and 5, in either order
- **THEN** the usage file retains an invalid output total and existing malformed-usage validation makes the worker step an execution failure
- **AND** the adapter does not report a valid total of 4 or silently omit the total

#### Scenario: Distinct OpenCode steps cannot cancel a nested negative counter
- **WHEN** the latest reports for two distinct OpenCode model steps contain `cache.read` values of -1 and 5, in either order
- **THEN** the usage file retains an invalid input total and existing malformed-usage validation makes the worker step an execution failure

#### Scenario: Distinct OpenCode steps cannot cancel negative cost
- **WHEN** the latest reports for two distinct OpenCode model steps contain explicitly reported USD costs of -1 and 5, in either order
- **THEN** the usage file retains an invalid reported cost and existing malformed-usage validation makes the worker step an execution failure
- **AND** the adapter does not report a valid cost of 4 or silently omit the cost

#### Scenario: Latest OpenCode step report remains the accounting boundary
- **WHEN** OpenCode updates one model step from a negative quantity to a valid final quantity and all selected latest reports contain finite non-negative quantities
- **THEN** the adapter sums the latest reports once per distinct model step and does not retain the superseded quantity as an additional report or failure

### Requirement: Native archival

After every earlier stage completes, the controller SHALL archive the change with native OpenSpec archive in the run's worktree, which validates the change, moves it under the archive and applies its spec deltas to the main specs, and SHALL commit the result on the change's branch. When OpenSpec refuses to archive the change, the run SHALL stop at archival, name OpenSpec's output, and commit nothing.

#### Scenario: Change archived
- **WHEN** the run reaches archival with a valid change
- **THEN** the change is moved under the archive, its spec deltas are applied to the main specs, and the result is committed on the change's branch

#### Scenario: Archive refused
- **WHEN** OpenSpec refuses to archive the change, such as when its spec deltas fail validation
- **THEN** the run stops at archival, the report names OpenSpec's output, and the change's branch gains no commit

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

### Requirement: Delivery remote

In `pr` and `merge` modes, the remote SHALL be the remote of the default branch's upstream as Git records it, and the remote's default branch SHALL be that upstream branch. In `pr` mode the pull request SHALL target the upstream remote's repository and the upstream branch. `loop run`, `loop resume` and `loop step` SHALL refuse a `pr` or `merge` configuration when the default branch has no upstream, and SHALL name the branch. In `local` mode the loop SHALL contact no remote.

#### Scenario: No upstream
- **WHEN** the configuration selects `merge` or `pr` and the default branch has no upstream
- **THEN** `loop run` refuses before creating a run and names the default branch

#### Scenario: Several GitHub remotes
- **WHEN** in `pr` mode the repository has several GitHub remotes and the default branch's upstream is on one of them
- **THEN** the pull request opens on that remote's repository against the upstream branch

#### Scenario: Local mode without a remote
- **WHEN** the configuration selects `local` in a repository with no remote
- **THEN** the run integrates, archives and completes without contacting a remote

### Requirement: Stage-bounded advancement

`loop step <change>` SHALL enroll a new run or advance an existing run with the same prerequisites, locking and controller as run/resume. It SHALL return after the first successful pending-stage completion, preserving internal cycles, budgets and handoffs. It SHALL exit 0 at a boundary or whole-run completion, 1 on a stop and 2 on a refusal. A boundary report and status SHALL distinguish the incomplete run from completion or interruption and name the next stage and step/resume commands.

#### Scenario: First step approves the proposal
- **WHEN** the user steps a new eligible change and its proposal review approves
- **THEN** proposal review completes, the command returns control and releases its lock, implementation remains pending, and no implementation worker starts

#### Scenario: Proposal cycle stays within one step
- **WHEN** proposal review requests a revision before approval, or approves with minor plan fixes
- **THEN** step runs the existing revision/review cycle or minor fixes within the configured budget before returning at the successful proposal-review boundary

#### Scenario: Subsequent step completes implementation
- **WHEN** proposal review is complete and the user steps the run again
- **THEN** implementation runs its existing implement/check/review cycle and any minor fixes, returns after success with integration next, and does not repeat proposal review

#### Scenario: Every stage has its own boundary
- **WHEN** an eligible run is stepped successively without handoffs or failures
- **THEN** each invocation completes the next stage in order: proposal-review, implementation, integration, archive and delivery; later stages do not start in that invocation, and delivery reports whole-run completion

#### Scenario: Ordinary continuation after stepping
- **WHEN** the user runs resume after a successful step
- **THEN** ordinary progression continues from the same persisted run through the remaining stages, preserves its branch, worktree, findings and transcripts, and does not repeat completed work

#### Scenario: Run after step does not reenroll
- **WHEN** the user runs run for a change already enrolled through step
- **THEN** run retains its existing already-enrolled refusal and names status and resume

#### Scenario: Boundary report and status
- **WHEN** step successfully completes a stage while another remains pending
- **THEN** its report identifies the completed stage, says control returned between stages, names the next pending stage and step/resume commands, includes the usual locations and cumulative usage, and status shows the boundary rather than an interruption or whole-run completion

#### Scenario: Step after completion
- **WHEN** the user steps a run with every stage complete
- **THEN** the command reports the run complete and exits 0 without repeating a stage or enrolling again

#### Scenario: Prerequisites still apply
- **WHEN** the user steps a new change whose proposal is not committed, whose invoking non-default worktree is dirty, or whose configuration or advancement prerequisites fail
- **THEN** the loop refuses as ordinary enrollment would before any stage advances

#### Scenario: Prerequisites reread on continuation
- **WHEN** configuration in the invoking checkout changes between steps or a required advancement prerequisite becomes unavailable
- **THEN** the next step reads that configuration and applies the ordinary preparation refusals while retaining the existing run's worktree

#### Scenario: Shared lock refuses concurrent commands
- **WHEN** any run, resume or step advancement is active and another advancement is requested for that change
- **THEN** the second command is refused and the active advancement continues unaffected

#### Scenario: Execution failure or exhausted attempts
- **WHEN** a stepped stage has an execution failure or exhausts its normal attempts
- **THEN** it stops with the existing cause, recovery, transcript and usage reporting, exits 1, and a later explicit step or resume uses the same recovery data with a fresh configured budget

#### Scenario: Decision question during a step
- **WHEN** a review finding needs a decision the design does not record
- **THEN** step stops with the existing question before revising, and after the user records and commits the decision an explicit step or resume follows existing proposal-review recovery

#### Scenario: Implementation hands the plan back
- **WHEN** stepped implementation reports a plan problem and the existing plan-revision handoff succeeds
- **THEN** step follows that handoff within the same budgets and returns when proposal review completes, with implementation next and no resumed implementer turn in that invocation

#### Scenario: Integration hands findings back
- **WHEN** stepped integration returns a conflict, changed patch or failed integrated checks to implementation
- **THEN** step follows the existing handoff and returns when implementation succeeds, with integration next and no retry of integration in that invocation

#### Scenario: Interrupted step and surviving worker
- **WHEN** a stepped advancement is interrupted or its controller dies
- **THEN** status retains stopped or interrupted semantics, and step/resume uses existing takeover rules, refusing while the dead controller's worker group survives and redoing incomplete work once takeover is permitted

#### Scenario: Step options remain minimal
- **WHEN** step is invoked with extra arguments other than four agent aliases, including attempts or implement options
- **THEN** the CLI refuses the syntax with usage and exit status 2; those options remain exclusive to resume

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

### Requirement: Project skill setup

The loop SHALL provide `loop setup`, accepting no arguments or options, to install every bundled skill into `.agents/skills/` and `.claude/skills/` in the invoking Git checkout's root. The executing package SHALL supply the skill contents independently of the current directory, PATH and npm's global prefix. Success SHALL print each installed destination and exit 0.

#### Scenario: Initial installation
- **WHEN** `loop setup` runs in an OpenSpec-initialized Git checkout with no bundled skill copies
- **THEN** both tool directories contain every skill from the executing package, including `openspec-loop` and `openspec-scope`, with the packaged contents
- **AND** the command prints their destination paths and exits 0

#### Scenario: Subdirectory invocation
- **WHEN** `loop setup` runs from a subdirectory of that checkout
- **THEN** it installs the skills at the checkout root, without creating tool directories in the subdirectory

#### Scenario: Linked worktree invocation
- **WHEN** `loop setup` runs in a linked worktree
- **THEN** it updates that worktree's skill directories and leaves other checkouts untouched

#### Scenario: Installed package supplies the skills
- **WHEN** the installed package is outside the invoking repository and npm's current global prefix points elsewhere
- **THEN** setup installs the skills supplied by the package whose `loop` command is executing

#### Scenario: Unsupported setup arguments
- **WHEN** `loop setup` is given any argument or option
- **THEN** it prints usage, exits 2 and writes no files

### Requirement: Bundled skill refresh

Rerunning `loop setup` SHALL replace existing bundled skill directories with the executing package's copies and add missing bundled skills. Replacement SHALL remove obsolete contents within those package-owned directories and overwrite local edits there. Setup SHALL preserve unrelated skill directories, native OpenSpec skills and files outside the bundled skill destinations. Repeated setup with the same package SHALL leave the same file contents.

#### Scenario: Upgrade adds the missing scoping skill
- **WHEN** a project has an older supervision skill and no scoping skill, and setup runs from a package bundling both
- **THEN** both tool directories receive the current supervision and scoping skills
- **AND** unrelated skills and native OpenSpec instructions remain unchanged

#### Scenario: Obsolete bundled files removed
- **WHEN** a bundled skill's project copy contains an obsolete file or local edit
- **THEN** setup replaces that skill directory with the packaged contents, removing the obsolete file and overwriting the edit

#### Scenario: Setup repeated
- **WHEN** setup is rerun after successful installation with the same package
- **THEN** the installed file contents remain identical and the command succeeds

### Requirement: Setup boundaries and failures

Setup SHALL require a Git working tree, without loading loop configuration, requiring an OpenSpec root or resolving workers. It SHALL refuse with exit 2 before writing when the project is unsuitable or a destination directory path is a file or symlink, naming the problem. A source or copy failure SHALL exit 1 and name the failing path. Setup SHALL change no configuration, Git refs, index, run state or user-level skill directories, and SHALL enroll no run.

#### Scenario: Project setup not yet complete
- **WHEN** setup runs in a Git checkout without an OpenSpec root, `openspec/loop.yaml` or configured worker executables
- **THEN** it installs the skills without requiring run preparation or creating OpenSpec or loop configuration

#### Scenario: Unsuitable project
- **WHEN** setup runs outside a Git working tree
- **THEN** it refuses with exit 2, identifies the missing prerequisite and creates no files

#### Scenario: Obstructed destination
- **WHEN** a path needed for a tool's skill directory or a bundled skill directory is occupied by a file or symlink
- **THEN** setup refuses before changing any destination and names the obstructing path
- **AND** it leaves the object and any symlink target untouched

#### Scenario: Installation fails
- **WHEN** a bundled source cannot be read or a destination cannot be written
- **THEN** setup exits 1, identifies the failing path and does not report successful completion
- **AND** a later explicit setup invocation can refresh all destinations after the cause is corrected

#### Scenario: Project configuration preserved
- **WHEN** setup succeeds in a configured project
- **THEN** loop configuration, OpenSpec configuration, ignore files, Git refs, the index and existing run state remain unchanged
- **AND** only the invoking checkout's bundled skill destinations are installed or refreshed

### Requirement: Role agents on the command

`loop run`, `loop step` and `loop resume` SHALL accept no agent aliases or exactly four after the change name, in role order: proposal reviewer, plan reviser, implementer, implementation reviewer. The command SHALL run with them and SHALL write them as the `roles` entries of `openspec/loop.local.yaml` in the run's worktree, keeping the file's other content. Each alias SHALL resolve through the configuration. The supervision skill SHALL pass aliases the user names.

#### Scenario: Agents named on run
- **WHEN** the configuration defines `claude`, `codex`, `muse` and `deepseek`, and the user runs `loop run add-thing claude codex muse deepseek`
- **THEN** `claude` reviews the proposal, `codex` revises the plan, `muse` implements and `deepseek` reviews the implementation
- **AND** the run worktree's `openspec/loop.local.yaml` assigns those four agents to the roles

#### Scenario: Existing local file kept
- **WHEN** the run worktree's local file already defines agents or other settings and the user names four aliases
- **THEN** only its `roles` entries change

#### Scenario: Later command from the run's worktree
- **WHEN** the four agents are defined in configuration the run's worktree reads, and the user later runs `loop resume add-thing` or `loop step add-thing` without aliases from that worktree
- **THEN** the run continues with the written agents

#### Scenario: Unresolvable alias
- **WHEN** an alias on the command is not defined by the configuration, or its agent's command cannot be found
- **THEN** the loop refuses, names the role and the alias, and changes nothing

#### Scenario: Wrong number of aliases
- **WHEN** the user gives one, two, three or more than four aliases
- **THEN** the loop prints usage, exits 2 and changes nothing

#### Scenario: Skill invoked with agents
- **WHEN** the user asks the supervision skill to run a change with four agents
- **THEN** the skill runs the command with those aliases in role order

### Requirement: OpenCode transport lifetime

The OpenCode adapter SHALL explicitly disable client response-header and response-body inactivity timeouts for its local HTTP requests and event subscription. Waiting for a prompt SHALL have no adapter-imposed elapsed-time limit. Worker interruption, transport or session failure and unexpected server exit SHALL still end the worker through the existing owned-server lifecycle.

#### Scenario: Prompt delays response headers
- **WHEN** an OpenCode prompt completes successfully after a delay longer than the HTTP client's default header timeout
- **THEN** the adapter waits for completion and writes the reply from the root session's reply-tool call instead of failing on that default timeout

#### Scenario: Prompt pauses response-body delivery
- **WHEN** the prompt response starts and then pauses longer than the HTTP client's default body inactivity timeout before delivering the remaining valid response
- **THEN** the adapter waits for the remaining response and writes the reply from the root session's reply-tool call

#### Scenario: Event subscription is temporarily quiet
- **WHEN** the event subscription emits no data for longer than the HTTP client's default body inactivity timeout while the prompt is still pending, then resumes and reports completion
- **THEN** the adapter keeps the subscription open and completes with the reply from the root session's reply-tool call and the reported usage

#### Scenario: Worker interrupted during an unbounded wait
- **WHEN** the worker is interrupted while waiting for prompt headers, response-body data or event-stream data
- **THEN** those waits are cancelled and the owned server is stopped without waiting for a response or an inactivity timeout

### Requirement: OpenCode failure diagnostics

Before cleanup, the OpenCode adapter SHALL retain the originating failure's name, message, code, complete cause chain and available stacks in the existing worker transcript. HTTP failures SHALL identify the method, API path and whether the failure occurred requesting or reading the response. Diagnostics SHALL NOT dump authentication headers or request bodies. Cleanup errors SHALL NOT erase the originating diagnostic.

#### Scenario: Transport fails before an HTTP response
- **WHEN** a local OpenCode HTTP request rejects with an error carrying an underlying transport cause and code
- **THEN** the transcript identifies the request method and API path and retains both the outer error and the underlying cause, code and available stacks rather than only a generic fetch message
- **AND** the worker fails without producing a successful reply or retrying the prompt

#### Scenario: Failure while reading a response
- **WHEN** reading the prompt response body or event subscription fails
- **THEN** the transcript identifies the affected API operation and response-reading failure and retains its available error and cause details

#### Scenario: Cleanup follows a transport failure
- **WHEN** a transport failure is followed by request cancellation or server termination during cleanup
- **THEN** the transcript still contains the originating transport diagnostic and any already-reported usage remains available under the existing adapter accounting rules

### Requirement: Shipped sandbox wrapper

The loop SHALL ship a worker command, `loop-jail`, that runs the worker command given as its arguments under ai-jail. Inside the jail the worker SHALL be able to write the run's worktree and a private `/tmp` and home discarded when it ends, reach the network, and run the wrapped command, its harness and `openspec`. The worker's `TMPDIR` SHALL name the jail's private `/tmp`. The wrapper SHALL exit with the wrapped command's status. A missing `ai-jail` SHALL be an execution failure that names it.

#### Scenario: Jailed worker does its work
- **WHEN** an implementer's agent is `[loop-jail, loop-opencode, --auto]`
- **THEN** the worker edits the worktree, runs the required checks and `openspec validate`, and writes a headless browser screenshot to `/tmp`, and its reply reaches the loop

#### Scenario: Jailed worker cannot write outside its jail
- **WHEN** a jailed worker writes to a file in the user's home directory outside the worktree
- **THEN** the write does not reach the host

#### Scenario: Wrapped command fails
- **WHEN** the wrapped command exits with status 3
- **THEN** `loop-jail` exits with status 3 and the step is an execution failure

#### Scenario: ai-jail is not installed
- **WHEN** `loop-jail` runs and no `ai-jail` command is on PATH
- **THEN** the worker fails with an error naming `ai-jail` and the run stops with an execution failure

#### Scenario: Temporary files with a host TMPDIR
- **WHEN** the loop runs with `TMPDIR` set to a host directory and a jailed worker runs `mktemp`
- **THEN** the file is created under the jail's `/tmp`

### Requirement: Sandboxed repository metadata

A jailed worker SHALL be able to read the repository's Git metadata but SHALL NOT be able to write the repository's Git directory or the worktree's `.git` file. The wrapper SHALL deliver the reply and usage the wrapped command writes to the paths the loop appended, whether the command succeeds or fails.

#### Scenario: Git reads work
- **WHEN** a jailed worker runs `git status` and `git diff` in the worktree
- **THEN** both report the worktree's state

#### Scenario: Git hooks and configuration stay unchanged
- **WHEN** a jailed worker writes a hook into the repository's Git directory, changes its configuration, or rewrites the worktree's `.git` file
- **THEN** each write fails and the host's Git metadata is unchanged

#### Scenario: Reply and usage reach the loop
- **WHEN** a jailed adapter writes its reply and usage and exits
- **THEN** the loop reads them at the reply and usage paths it appended, even when the adapter exits nonzero

### Requirement: Sandboxed harness files

For the shipped adapters, the wrapper SHALL share the harness's credential file writable, so that token refresh persists, and the harness's executable and user configuration read-only. Everything else the harness writes in the home directory SHALL be discarded when the worker ends.

#### Scenario: Harness starts authenticated
- **WHEN** a jailed `loop-claude`, `loop-codex`, `loop-agy` or `loop-opencode` worker starts on a host where its harness is logged in
- **THEN** the harness runs authenticated, with the user's configuration, and completes the worker's step

#### Scenario: Harness configuration stays unchanged
- **WHEN** a jailed worker writes to its harness's configuration
- **THEN** the write fails and the configuration on the host is unchanged
