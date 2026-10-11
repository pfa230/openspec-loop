# Spec Delta

## MODIFIED Requirements

### Requirement: Progress and usage reporting

As the run proceeds, the loop SHALL print each step when it starts and when it ends, naming the stage and, for a worker step, the alias of the agent that runs it. The end line SHALL add the outcome, such as the verdict with finding counts by severity, the check results or the failure, and, for a worker step, its usage and cost, including a worker step that ends in an execution failure. Usage and cost SHALL be shown as the harness reports them; a harness-provided cost estimate SHALL be identified as estimated, including a role total containing any estimated cost. Adapters MAY convert a reported USD denomination to US dollars, but the loop SHALL NOT calculate prices from tokens; a value the harness does not report SHALL be shown as unavailable, not as zero. The completed, stopped and successful stage-boundary reports SHALL total usage and cost by role over every worker step of the run, across every advancement, and SHALL say how many of a role's steps reported no usage. When some of a role's steps reported a cost, the report SHALL say how many reported none; when none did, the role's cost SHALL be shown as unavailable. A stop for a worker's execution failure SHALL name the step, the agent and its transcript. The loop SHALL keep every worker's transcript and SHALL name where it is in the report.

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

#### Scenario: Estimated cost reported and totaled
- **WHEN** a worker reports `costUsd` with `costEstimated: true`
- **THEN** its end line identifies the cost as estimated, and each role total including that step identifies its summed cost as estimated while retaining missing-cost counts

#### Scenario: Reported and estimated costs mixed
- **WHEN** a role has both reported costs without an estimate marker and estimated costs across advancements
- **THEN** the report sums their `costUsd` values once each, identifies the total as estimated, and keeps unavailable costs out of that sum

### Requirement: Worker interface

The loop SHALL run an agent by appending four paths to the agent's command: a prompt file, a JSON schema file, a reply file and a usage file. The command SHALL run in the run's worktree with no input, and its output SHALL be kept as the step's transcript. The step SHALL succeed only when the command exits 0 and the reply file holds a JSON object that matches the schema; anything else SHALL be an execution failure. The command MAY write the step's usage to the usage file as a JSON object of token counts named as its harness names them and a cost in US dollars, with optional `costEstimated: true` only when a cost is present; a command that writes no usage file reports no usage. A usage file that is not such an object SHALL be an execution failure.

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

#### Scenario: Estimate marker is additive
- **WHEN** a worker writes a non-negative finite `costUsd` and `costEstimated: true`
- **THEN** the usage file is accepted, and previously valid usage files without the marker remain accepted

#### Scenario: Estimate marker without cost
- **WHEN** a worker writes `costEstimated: true` without `costUsd`
- **THEN** the usage file is malformed and the step ends in an execution failure

### Requirement: Shipped adapters

The loop SHALL ship worker commands for Claude Code, Codex, Antigravity and OpenCode. Each SHALL run its harness headless in the run's worktree with the agent's remaining arguments passed to the harness, and SHALL write the harness's final answer as the reply. An adapter SHALL use its harness's own schema enforcement when the harness has one; otherwise it SHALL accept only a final message that parses as one JSON object. Each adapter SHALL write the token counts and cost its harness reports to the usage file, under the harness's own names, before it judges the harness's exit, and SHALL write no value the harness does not report. For a fresh exec thread, the Codex adapter SHALL attempt a bounded lookup of Codex's existing thread-cost estimate for that invocation's thread. It SHALL accept only an estimate attributed to that thread, convert USD micros to `costUsd` by dividing by 1,000,000, and write `costEstimated: true`. Lookup failure or an unavailable or invalid estimate SHALL leave cost unset and SHALL preserve token usage, reply handling and the harness's exit status. A cumulative estimate for a resumed thread SHALL NOT be recorded as a new worker step's cost.

#### Scenario: Harness arguments pass through
- **WHEN** the proposal reviewer's agent is `loop-codex` with a model and a sandbox argument
- **THEN** Codex runs with that model and sandbox, and its schema-conforming answer reaches the loop as the reply

#### Scenario: Harness without schema enforcement
- **WHEN** OpenCode's final message for a review is prose instead of one JSON object
- **THEN** the OpenCode adapter fails and the run stops with an execution failure

#### Scenario: Harness without cost
- **WHEN** Codex reports token counts and neither its exec stream nor the thread lookup supplies a usable cost
- **THEN** `loop-codex` writes those token counts and no cost to the usage file

#### Scenario: Harness fails after reporting usage
- **WHEN** a harness reports usage and then exits nonzero
- **THEN** the adapter writes that usage to the usage file and exits with the harness's status

#### Scenario: Exact exec thread has an estimate
- **WHEN** a fresh Codex exec invocation identifies its thread and Codex returns an estimate of 125000 USD micros for that same thread
- **THEN** the adapter writes `costUsd: 0.125` and `costEstimated: true` alongside the existing exec token counters

#### Scenario: Estimate belongs to another thread
- **WHEN** the thread-cost response identifies a different thread than the exec invocation
- **THEN** the adapter ignores its cost and retains the exec token counters and worker result

#### Scenario: Cost lookup is unavailable
- **WHEN** the invocation has no thread ID, or the cost lookup is unsupported, unauthenticated, times out, fails, or returns no usable USD estimate
- **THEN** the adapter leaves cost and the estimate marker unset, writes available exec token counters, and preserves the worker result and exit status

#### Scenario: Invalid estimate
- **WHEN** Codex returns a negative, non-numeric or unsafe USD-micro value
- **THEN** the adapter leaves cost unset

#### Scenario: Real zero estimate
- **WHEN** Codex explicitly reports zero USD micros for the matching fresh thread
- **THEN** the adapter writes `costUsd: 0` and `costEstimated: true`

#### Scenario: Resumed thread has a cumulative estimate
- **WHEN** Codex resumes an existing thread whose estimate includes prior invocations
- **THEN** the adapter retains the invocation's exec token counters and leaves cost unset rather than counting prior cost again
