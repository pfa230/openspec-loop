## MODIFIED Requirements

### Requirement: Supervision skill

The loop SHALL ship a skill for Claude and Codex that supervises a run through the loop's commands. The skill SHALL start the run and forward each progress line to the user as it arrives. When the run stops, the skill SHALL diagnose the stop with the user from the report, the transcripts, the review and check findings and the changes between attempts: the likely cause, the evidence that is missing, why attempts did not converge when they ran out, and a recovery. The skill SHALL change nothing while diagnosing, and SHALL repair or resume only with the user's agreement.

#### Scenario: Progress forwarded
- **WHEN** a supervised run starts a step
- **THEN** the user sees that step's progress line in the session as it is printed

#### Scenario: Attempts did not converge
- **WHEN** a supervised run stops with exhausted implementation attempts
- **THEN** the skill explains from the findings and the changes between attempts why they did not converge, proposes a recovery and waits for the user

#### Scenario: Execution failure diagnosed
- **WHEN** a supervised run stops with an execution failure of a worker
- **THEN** the skill reads that worker's transcript, names the likely cause and any evidence the transcript does not hold, proposes a recovery and waits for the user without changing anything

### Requirement: Progress and usage reporting

As the run proceeds, the loop SHALL print each step when it starts and when it ends, naming the stage and, for a worker step, the alias of the agent that runs it. The end line SHALL add the outcome, such as the verdict with finding counts by severity, the check results or the failure, and, for a worker step, its usage and cost, including a worker step that ends in an execution failure. Usage and cost SHALL be shown as the harness reports them, without estimation or conversion; a value the harness does not report SHALL be shown as unavailable, not as zero. The completed and stopped reports SHALL total usage and cost by role over every worker step of the run, across every advancement, and SHALL say how many of a role's steps reported no usage. When some of a role's steps reported a cost, the report SHALL say how many reported none; when none did, the role's cost SHALL be shown as unavailable. A stop for a worker's execution failure SHALL name the step, the agent and its transcript. The loop SHALL keep every worker's transcript and SHALL name where it is in the report.

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

### Requirement: Worker interface

The loop SHALL run an agent by appending four paths to the agent's command: a prompt file, a JSON schema file, a reply file and a usage file. The command SHALL run in the run's worktree with no input, and its output SHALL be kept as the step's transcript. The step SHALL succeed only when the command exits 0 and the reply file holds a JSON object that matches the schema; anything else SHALL be an execution failure. The command MAY write the step's usage to the usage file as a JSON object of token counts named as its harness names them and a cost in US dollars; a command that writes no usage file reports no usage. A usage file that is not such an object SHALL be an execution failure.

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

### Requirement: Shipped adapters

The loop SHALL ship worker commands for Claude Code, Codex, Antigravity and OpenCode. Each SHALL run its harness headless in the run's worktree with the agent's remaining arguments passed to the harness, and SHALL write the harness's final answer as the reply. An adapter SHALL use its harness's own schema enforcement when the harness has one; otherwise it SHALL accept only a final message that parses as one JSON object. Each adapter SHALL write the token counts and cost its harness reports to the usage file, under the harness's own names, before it judges the harness's exit, and SHALL write no value the harness does not report.

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
