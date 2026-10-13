# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

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
