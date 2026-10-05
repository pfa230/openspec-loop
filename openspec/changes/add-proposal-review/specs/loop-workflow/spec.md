## ADDED Requirements

### Requirement: Worker interface

The loop SHALL run an agent by appending three paths to the agent's command: a prompt file, a JSON schema file and a reply file. The command SHALL run in the run's worktree with no input, and its output SHALL be kept as the step's transcript. The step SHALL succeed only when the command exits 0 and the reply file holds a JSON object that matches the schema; anything else SHALL be an execution failure.

#### Scenario: Custom worker command
- **WHEN** an agent's command is a script that reads the prompt and writes a reply that matches the schema
- **THEN** the loop uses that reply as it would a shipped adapter's

#### Scenario: Malformed reply
- **WHEN** a worker exits 0 but its reply file is missing, is not JSON, or holds an object that does not match the schema
- **THEN** the run stops with an execution failure and the report names the transcript and the reply file

### Requirement: Shipped adapters

The loop SHALL ship worker commands for Claude Code, Codex, Antigravity and OpenCode. Each SHALL run its harness headless in the run's worktree with the agent's remaining arguments passed to the harness, and SHALL write the harness's final answer as the reply. An adapter SHALL use its harness's own schema enforcement when the harness has one; otherwise it SHALL accept only a final message that parses as one JSON object.

#### Scenario: Harness arguments pass through
- **WHEN** the proposal reviewer's agent is `loop-codex` with a model and a sandbox argument
- **THEN** Codex runs with that model and sandbox, and its schema-conforming answer reaches the loop as the reply

#### Scenario: Harness without schema enforcement
- **WHEN** OpenCode's final message for a review is prose instead of one JSON object
- **THEN** the OpenCode adapter fails and the run stops with an execution failure

## MODIFIED Requirements

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

### Requirement: Execution restrictions

Each external role SHALL run under the execution restrictions configured for it, such as sandboxing or permission limits. An agent's restrictions SHALL be part of its command, as harness arguments or as a wrapping command. An agent whose command adds no restrictions SHALL run with its harness's own defaults.

#### Scenario: Restricted reviewer
- **WHEN** the implementation reviewer's agent runs its adapter inside a sandbox wrapper
- **THEN** the reviewer runs inside that sandbox while the implementer runs under its own agent's command

### Requirement: Reviews and verdicts

Each review SHALL end in a recorded `APPROVE` or `REVISE` verdict, and each finding SHALL be classified as blocking or minor. The reviewer SHALL classify the findings, and the loop SHALL derive the verdict from them. A blocking finding means the work fails the review's criteria; a minor finding has a local fix that cannot change behavior or a decision recorded in the design. A review with any blocking finding SHALL be `REVISE`, which requires revision followed by another review. A review with only minor findings SHALL be `APPROVE`: the plan reviser applies minor plan fixes and the implementer applies minor implementation fixes, the required checks run again for implementation, and the approval covers the result. Reviewers SHALL NOT modify the candidate they review. Each recorded verdict SHALL identify its reviewed inputs precisely enough to tell whether they changed afterward. The plan is the change's OpenSpec planning artifacts (proposal, design, spec deltas, tasks) excluding task completion marks. Proposal review SHALL judge whether the whole plan can be implemented and verified as one change without asking the user, and whether it keeps the decisions recorded in the design. An implementation approval covers the change's patch, not the base it applies to. Proposal approval SHALL start implementation automatically, after any minor plan fixes.

#### Scenario: Plan approved
- **WHEN** the proposal reviewer returns `APPROVE`
- **THEN** the controller starts implementation without further user action

#### Scenario: Verdict follows the findings
- **WHEN** a reviewer reports one blocking finding among several minor ones
- **THEN** the recorded verdict is `REVISE`

#### Scenario: Only minor plan findings
- **WHEN** the proposal reviewer finds only minor issues
- **THEN** the verdict is `APPROVE`, the plan reviser applies the fixes, and implementation starts without another proposal review

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

Once a proposal is committed, revising its plan SHALL need no user. When proposal review returns `REVISE`, or the implementer finds that the approved plan needs a change, the plan reviser SHALL revise the plan in a fresh context and the plan SHALL return to proposal review. The reviser SHALL NOT change a decision recorded in the design. A finding or plan problem that needs a decision the plan does not record SHALL stop the run with the question; the user answers by recording the decision in the plan on the run's branch and resuming. A reviewer SHALL raise such a decision as a question on its finding, and any finding with a question SHALL stop the run before the plan is revised.

#### Scenario: Plan review requests changes
- **WHEN** the proposal reviewer returns `REVISE`
- **THEN** the plan reviser revises the plan and the plan is reviewed again, without the user

#### Scenario: Plan cannot be implemented as written
- **WHEN** the implementer finds that the approved plan needs a change
- **THEN** the plan reviser revises the plan, proposal review runs again, and implementation continues after approval

#### Scenario: Decision needed
- **WHEN** a review finding carries a question for a decision the plan does not record
- **THEN** the run stops with the question without revising the plan, and after the user records the decision and resumes, the plan returns to proposal review

### Requirement: Bounded attempts and execution failures

Proposal review and implementation SHALL each be bounded by a configured number of attempts. Each proposal review SHALL consume one proposal attempt. Each implementation round, meaning an implementer turn on the code with the checks and review that follow it and any approved minor fixes, SHALL consume one implementation attempt, whether it succeeds or ends in an execution failure. Reaching a bound with a standing `REVISE` or failing checks SHALL stop progression; a bound never approves work. Every resume SHALL grant each bounded stage it runs a fresh budget, whatever stopped the run; `loop resume` SHALL accept an attempt count that replaces the configured budgets for that resume. An execution failure of a worker or the loop itself, such as a nonzero worker exit, a signal, a timeout or a missing or malformed reply, SHALL be reported as a failure distinct from review findings and check results, SHALL stop progression and SHALL NOT be retried automatically.

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

### Requirement: Progress and usage reporting

As the run proceeds, the loop SHALL print each step when it starts and when it ends, naming the stage and, for a worker step, the alias of the agent that runs it. The end line SHALL add the outcome, such as the verdict with finding counts by severity, the check results or the failure, and, for a worker step, its usage and cost. Usage and cost SHALL be shown as the harness reports them; a value the harness does not report SHALL be shown as unavailable, not as zero. The loop SHALL keep every worker's transcript and SHALL name where it is in the report.

#### Scenario: Review step reported
- **WHEN** a proposal review ends in `REVISE`
- **THEN** the end line names the stage, the reviewer's agent alias, the verdict, the blocking and minor finding counts, and the review's usage and cost

#### Scenario: Harness reports no usage
- **WHEN** a harness reports no usage or cost for a step
- **THEN** that step's usage and cost are shown as unavailable instead of zero

#### Scenario: Worker fails
- **WHEN** a worker ends in an execution failure
- **THEN** the report names where that worker's transcript is

### Requirement: Loop configuration

The loop SHALL read its configuration from `openspec/loop.yaml` in the checkout where `loop run` or `loop resume` is given, each time either is given, and from `openspec/loop.local.yaml` beside it when that file exists. A value the local file sets SHALL replace the committed value: a top-level setting as a whole, and `agents`, `roles` and `attempts` entry by entry. The configuration SHALL name the default branch, and the loop SHALL take it from the configuration and SHALL NOT detect it. A missing `openspec/loop.yaml`, unparseable YAML, an unknown key or a value of the wrong type in either file SHALL refuse the command and name the problem and the file. A required field missing after the files are combined SHALL refuse the command and name the field.

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
