## MODIFIED Requirements

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

### Requirement: Worker interface

The loop SHALL run an agent by appending four paths to the agent's command: a prompt file, a JSON schema file, a reply file and a usage file. The command SHALL run in the run's worktree with no input, and its output SHALL be kept as the step's transcript. The step SHALL succeed only when the command exits 0 and the reply file holds a JSON object that matches the schema; anything else SHALL be an execution failure. The command MAY write the step's usage to the usage file as a JSON object with optional `inputTokens`, every prompt token the model processed whether or not it was cached, optional `outputTokens`, every token the model generated including reasoning, and optional `costUsd`, a cost in US dollars, each a finite non-negative number. A command that writes no usage file reports no usage. A usage file that is not such an object SHALL be an execution failure.

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

### Requirement: Shipped adapters

The loop SHALL ship worker commands for Claude Code, Codex, Antigravity and OpenCode. Each SHALL run its harness headless in the run's worktree and SHALL write the harness's final answer as the reply. Claude Code, Codex and Antigravity SHALL pass the agent's remaining arguments to the harness. OpenCode SHALL preserve model (`-m`/`--model`), agent, variant, explicit `--auto` permission approval and pure-mode selections through its supported API/server options, and SHALL name and reject unsupported arguments before starting the harness. Claude Code, Codex and Antigravity SHALL use their harness's own schema enforcement. The OpenCode adapter SHALL own one local harness process for one worker prompt, terminate it when the worker completes, fails or is interrupted, and SHALL offer the model a reply tool whose arguments are the supplied worker schema's properties, without forcing a tool choice, and SHALL write the arguments of the root session's last completed reply-tool call as its reply, without parsing text messages for a reply. The loop's reply validation SHALL be the check of those arguments. Supplying that tool SHALL be scoped to the worker process, preserve existing configuration and restrictions, and require no persistent configuration edits. OpenCode SHALL retain headless denial of questions and plan-mode transitions, reject permission requests unless explicit auto approval is enabled, and preserve configured denies for both root and delegated sessions. Settings or arguments that cannot be honored SHALL fail explicitly rather than be discarded or weaken restrictions. An otherwise successful OpenCode prompt without a root reply-tool call SHALL be reported as a missing reply even when text contains a schema-conforming object. API or session errors and unexpected harness exits SHALL be execution failures; an unexpected nonzero harness exit SHALL preserve its status and reported usage. Expected shutdown of an owned server after a completed prompt SHALL NOT turn that prompt into a harness failure. The adapter SHALL NOT repair text or launch another worker turn. Each adapter SHALL write its harness's reported usage to the usage file as input tokens, output tokens and any explicitly reported USD cost before it judges the harness's exit. It SHALL derive each token total by adding the native fields that, under that harness's counting rules, make up all prompt tokens or all generated tokens, so that cached prompt tokens count once as input and reasoning tokens count once as output. It SHALL write a total only when the harness reported at least one of its fields, and SHALL write no cost the harness does not report. A negative or nonfinite native value SHALL make the written total or cost invalid for existing worker validation; other fields or model steps SHALL NOT cancel or hide it. An adapter SHALL preserve its harness's final-summary or per-step accounting boundary, without adding repeated cumulative snapshots together. Usage collection SHALL use the existing worker invocation's output, including its subscribed OpenCode event stream, and SHALL NOT add an auxiliary command, API lookup, pricing calculation or inference run. The harness's native usage SHALL remain in the transcript.

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

#### Scenario: Reply-tool arguments that break the schema
- **WHEN** the root session calls the reply tool with arguments that omit a required property of the worker schema
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
