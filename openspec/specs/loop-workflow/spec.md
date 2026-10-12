# loop-workflow Specification

## Purpose

The openspec-loop product contract: how a change proposed with the user becomes a reviewed, implemented, tested, archived and delivered result without further attention, and what the loop does and does not own along the way. The user attends only the proposal; everything after it runs unattended. openspec-loop is a simple, minimal harness: a lightweight assistant that runs one change and steps aside for the human, not a bulletproof enforcement system.

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

The loop SHALL ship a skill for Claude and Codex that supervises a run through the loop's commands, including `step`. The skill SHALL start the run and forward each progress line to the user as it arrives. When the run completes, stops or returns control between stages, the skill SHALL show the user its report unchanged. When the run stops, the skill SHALL diagnose the stop with the user from the report, the transcripts, the failing agent's configured command, the review and check findings and the changes between attempts: the likely cause, the evidence that is missing, why attempts did not converge when they ran out, and a recovery. The skill SHALL change nothing while diagnosing, and SHALL repair or continue only with the user's agreement. A successful stage boundary SHALL be presented for inspection without failure diagnosis or automatic continuation.

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
- **THEN** the skill reads that worker's transcript, names the likely cause and any evidence the transcript does not hold, proposes a recovery and waits for the user without changing anything

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

Each review SHALL end in a recorded `APPROVE` or `REVISE` verdict, and each finding SHALL be classified as blocking or minor. The reviewer SHALL classify the findings, and the loop SHALL derive the verdict from them. A blocking finding means the work fails the review's criteria; a minor finding has a local fix that cannot change behavior or a decision recorded in the design. A review with any blocking finding SHALL be `REVISE`, which requires revision followed by another review. A review with only minor findings SHALL be `APPROVE`: the plan reviser applies minor plan fixes and the implementer applies minor implementation fixes, the required checks run again for implementation, and the approval covers the result. Reviewers SHALL NOT modify the candidate they review. The plan is the change's OpenSpec planning artifacts (proposal, design, spec deltas, tasks) excluding task completion marks. Proposal review SHALL judge whether the whole plan can be implemented and verified as one change without asking the user, and whether it keeps the decisions recorded in the design. The change's patch is its difference from the commit it branches from on the base, outside the change's directory `openspec/changes/<change>/`, so it holds no part of the plan or its task completion marks. An implementation approval covers the change's patch, not the base it applies to. Proposal approval SHALL start implementation automatically, after any minor plan fixes, during ordinary advancement; `loop step` SHALL instead return control after proposal review completes.

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

The controller SHALL run implementation as a cycle: implement, run the required checks, review the implementation, and revise as required. The implementer SHALL work from the change's native OpenSpec apply instructions, including the apply guidance the repository's OpenSpec configuration sets. The required checks SHALL be the commands listed in the loop configuration. A missing list SHALL refuse the run; an explicitly empty list SHALL mean the run has no required checks. A check that runs and fails SHALL be a check result, not an execution failure: its output SHALL return to the implementer as findings for the next attempt, and implementation review SHALL wait until the checks pass. When the checks fail after approved minor implementation fixes, the approval SHALL lapse and the failure SHALL return to the implementer as for any failed check. Implementation review SHALL judge whether the change's patch implements the whole approved plan, stays within it, and keeps the decisions recorded in the design. Implementation SHALL stay within the approved plan. Repairs SHALL be limited to failures the change caused; a failure the change did not cause SHALL NOT authorize unrelated or pre-existing repairs, so it persists until attempts run out.

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

As the run proceeds, the loop SHALL print each step when it starts and when it ends, naming the stage and, for a worker step, the alias of the agent that runs it. The end line SHALL add the outcome, such as the verdict with finding counts by severity, the check results or the failure, and, for a worker step, its usage and cost, including a worker step that ends in an execution failure. Usage and cost SHALL be shown as the harness reports them, without estimation or conversion; a value the harness does not report SHALL be shown as unavailable, not as zero. The loop SHALL show every reported numeric consumption counter supplied through the usage file, including input, output, cached, cache creation, reasoning/thinking, total tokens and request counts, preserving the harness's names and nested paths rather than selecting a fixed subset or synthesizing a common total. The completed, stopped and successful stage-boundary reports SHALL total usage and cost by role over every worker step of the run, across every advancement, and SHALL say how many of a role's steps reported no usage. Each counter SHALL be totaled independently by its reported name; overlapping totals and breakdowns SHALL NOT be added together into another counter. When some of a role's steps reported a cost, the report SHALL say how many reported none; when none did, the role's cost SHALL be shown as unavailable. A stop for a worker's execution failure SHALL name the step, the agent and its transcript. The loop SHALL keep every worker's transcript and SHALL name where it is in the report.

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
- **WHEN** a worker reports a total-token counter, nested thinking or cache counters, request counts or another numeric consumption counter
- **THEN** the step and role reports include every supplied counter under its native name or nested path
- **AND** each counter is totaled independently without treating a reported total and its breakdown as additional combined consumption

#### Scenario: Explicit zero and absent cost
- **WHEN** a worker reports a cached-token count of zero and no cost
- **THEN** the cached-token count appears as zero and cost appears as unavailable

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

The loop SHALL run an agent by appending four paths to the agent's command: a prompt file, a JSON schema file, a reply file and a usage file. The command SHALL run in the run's worktree with no input, and its output SHALL be kept as the step's transcript. The step SHALL succeed only when the command exits 0 and the reply file holds a JSON object that matches the schema; anything else SHALL be an execution failure. The command MAY write the step's usage to the usage file as a JSON object with optional `tokens`, a map of numeric consumption counters under their harness names or nested paths, and optional `costUsd`, a cost in US dollars. The existing `tokens` map SHALL accept all reported consumption counter names, including token and request counts, without a fixed counter-name allowlist. The loop SHALL continue to accept existing usage files with either or both of these fields; a command that writes no usage file reports no usage. A usage file that is not such an object SHALL be an execution failure.

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
- **WHEN** a worker exits 0 with a valid reply but its usage file is not JSON or holds a count or cost that is not a non-negative number
- **THEN** the run stops with an execution failure that names the usage file

#### Scenario: Custom worker supplies additional counters
- **WHEN** a custom worker writes finite non-negative counters with names such as `total_tokens`, `output_tokens_details.thinking_tokens` or `server_tool_use.web_search_requests` in the existing `tokens` map
- **THEN** the loop accepts and reports those counters without requiring a backend-specific format or new usage fields

### Requirement: Shipped adapters

The loop SHALL ship worker commands for Claude Code, Codex, Antigravity and OpenCode. Each SHALL run its harness headless in the run's worktree with the agent's remaining arguments passed to the harness, and SHALL write the harness's final answer as the reply. An adapter SHALL use its harness's own schema enforcement when the harness has one; otherwise it SHALL accept only a final message that parses as one JSON object. Each adapter SHALL write every numeric consumption counter from its harness's reported usage or token object and any explicitly reported USD cost to the usage file, under the harness's own names and nested paths, before it judges the harness's exit, and SHALL write no value the harness does not report. Counter collection SHALL NOT be restricted to a fixed list of names. An adapter SHALL preserve its harness's final-summary or per-step accounting boundary, without adding repeated cumulative snapshots together. Usage collection SHALL use the existing worker invocation's output and SHALL NOT add an auxiliary command, API lookup, pricing calculation or inference run. Unrelated event fields and nonnumeric metadata SHALL remain in the transcript rather than being treated as summable consumption counters.

#### Scenario: Harness arguments pass through
- **WHEN** the proposal reviewer's agent is `loop-codex` with a model and a sandbox argument
- **THEN** Codex runs with that model and sandbox, and its schema-conforming answer reaches the loop as the reply

#### Scenario: Harness without schema enforcement
- **WHEN** OpenCode's final message for a review is prose instead of one JSON object
- **THEN** the OpenCode adapter fails and the run stops with an execution failure

#### Scenario: Harness without cost
- **WHEN** Codex reports token counts and no cost for a turn
- **THEN** `loop-codex` writes those token counts and no cost to the usage file

#### Scenario: Harness fails after reporting usage
- **WHEN** a harness reports usage and then exits nonzero
- **THEN** the adapter writes that usage to the usage file and exits with the harness's status

#### Scenario: Complete usage from every shipped backend
- **WHEN** Claude Code, Codex, Antigravity or OpenCode emits numeric counters in its reported usage or token object, including additional or nested counters
- **THEN** its adapter includes every such counter under its native path in the same usage-file format
- **AND** it includes an explicitly reported USD cost and leaves an unreported cost absent
- **AND** it launches only the existing worker harness invocation

#### Scenario: Backend accounting boundaries
- **WHEN** a backend emits several cumulative final-summary snapshots or OpenCode emits several model-step usage records
- **THEN** the adapter uses the final applicable summary for a summary-reporting backend and sums corresponding counters and reported cost across OpenCode's model steps
- **AND** it does not add a cumulative summary to the usage that summary already includes

#### Scenario: Numeric nested usage and metadata
- **WHEN** a usage object contains nested numeric consumption counters, an array of numeric consumption breakdowns, and metadata such as a service-tier string
- **THEN** the adapter preserves each numeric leaf under its dotted object path or array-index path in the counter map
- **AND** it leaves nonnumeric metadata in the transcript and does not turn it into a counter

#### Scenario: Invalid collected quantity
- **WHEN** collecting the numeric leaves of a backend's selected usage or token object produces a usage file containing a negative or nonfinite quantity
- **THEN** the existing malformed-usage validation rejects that file and the worker step is an execution failure
- **AND** the adapter does not silently remove an invalid numeric field to make the file pass validation

### Requirement: Native archival

After every earlier stage completes, the controller SHALL archive the change with native OpenSpec archive in the run's worktree, which validates the change, moves it under the archive and applies its spec deltas to the main specs, and SHALL commit the result on the change's branch. When OpenSpec refuses to archive the change, the run SHALL stop at archival, name OpenSpec's output, and commit nothing.

#### Scenario: Change archived
- **WHEN** the run reaches archival with a valid change
- **THEN** the change is moved under the archive, its spec deltas are applied to the main specs, and the result is committed on the change's branch

#### Scenario: Archive refused
- **WHEN** OpenSpec refuses to archive the change, such as when its spec deltas fail validation
- **THEN** the run stops at archival, the report names OpenSpec's output, and the change's branch gains no commit

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
- **WHEN** step is invoked with extra arguments, including attempts or implement options
- **THEN** the CLI refuses the syntax with usage and exit status 2; those options remain exclusive to resume
