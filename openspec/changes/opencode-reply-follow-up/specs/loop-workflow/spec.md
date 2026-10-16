# Spec Delta

## MODIFIED Requirements

### Requirement: Shipped adapters

The loop SHALL ship worker commands for Claude Code, Codex, Antigravity and OpenCode. Each SHALL run its harness headless in the run's worktree and SHALL write the harness's final answer as the reply. Claude Code, Codex and Antigravity SHALL pass the agent's remaining arguments to the harness. OpenCode SHALL preserve model (`-m`/`--model`), agent, variant, explicit `--auto` permission approval and pure-mode selections through its supported API/server options, and SHALL name and reject unsupported arguments before starting the harness. Claude Code, Codex and Antigravity SHALL use their harness's own schema enforcement. The OpenCode adapter SHALL own one local harness process for one worker prompt, terminate it when the worker completes, fails or is interrupted, and SHALL offer the model a reply tool with one required string argument, `reply`, containing a JSON-encoded object matching the supplied worker schema, without forcing a tool choice, and SHALL write the decoded object from the root session's last completed reply-tool call as its reply, without parsing text messages for a reply. The tool SHALL describe the supplied schema and the required encoding to the model. Decoding SHALL preserve JSON values, including null, without repair, coercion or inferred defaults. The reply tool SHALL reject a missing or non-string `reply`, malformed JSON or a decoded value that is not an object with an error identifying the problem; such a call SHALL NOT complete or supply the reply, and its error SHALL reach the model within its turn. The reply tool SHALL reject a call whose decoded object omits a required top-level property of the worker schema with an error naming the missing properties; such a call SHALL NOT complete and SHALL NOT supply the reply, and its error SHALL reach the model within its turn. A completed root reply-tool call whose `reply` does not decode to an object SHALL be an execution failure. The loop's reply validation SHALL be the schema check of the written object beyond the tool's transport and required-top-level-property checks. Supplying that tool SHALL be scoped to the worker process, preserve existing configuration and restrictions, and require no persistent configuration edits. OpenCode SHALL retain headless denial of questions and plan-mode transitions, reject permission requests unless explicit auto approval is enabled, and preserve configured denies for both root and delegated sessions. Settings or arguments that cannot be honored SHALL fail explicitly rather than be discarded or weaken restrictions. When an OpenCode prompt completes without an API or session error and without a completed root reply-tool call, the adapter SHALL send one follow-up prompt in the same session, with the worker's model, agent and variant selections, asking the model only to call the reply tool without repeating the work. A follow-up that also completes without a completed root reply-tool call SHALL be reported as a missing reply even when text contains a schema-conforming object. A prompt that fails SHALL receive no follow-up. API or session errors and unexpected harness exits SHALL be execution failures; an unexpected nonzero harness exit SHALL preserve its status and reported usage. Expected shutdown of an owned server after a completed prompt SHALL NOT turn that prompt into a harness failure. Beyond that one follow-up prompt, the adapter SHALL NOT repair text, send another prompt or launch another worker turn. Each adapter SHALL write its harness's reported usage to the usage file as input tokens, output tokens and any explicitly reported USD cost before it judges the harness's exit. It SHALL derive each token total by adding the native fields that, under that harness's counting rules, make up all prompt tokens or all generated tokens, so that cached prompt tokens count once as input and reasoning tokens count once as output. It SHALL write a total only when the harness reported at least one of its fields, and SHALL write no cost the harness does not report. A negative or nonfinite native value SHALL make the written total or cost invalid for existing worker validation; other fields or model steps SHALL NOT cancel or hide it. An adapter SHALL preserve its harness's final-summary or per-step accounting boundary, without adding repeated cumulative snapshots together. Usage collection SHALL use the existing worker invocation's output, including its subscribed OpenCode event stream, and SHALL NOT add an auxiliary command, API lookup, pricing calculation or inference run. The harness's native usage SHALL remain in the transcript.

#### Scenario: Harness arguments pass through
- **WHEN** the proposal reviewer's agent is `loop-codex` with a model and a sandbox argument
- **THEN** Codex runs with that model and sandbox, and its schema-conforming answer reaches the loop as the reply

#### Scenario: OpenCode cut report stays out of the reply
- **WHEN** a successful OpenCode turn emits a required cut report as text and calls the reply tool with a string encoding an object matching the worker schema
- **THEN** the adapter writes only the decoded object as the reply and keeps the cut report in the transcript
- **AND** the loop can continue its existing commit, required-check and review sequence

#### Scenario: Harness without schema enforcement
- **WHEN** OpenCode's prompt and its follow-up prompt both complete without an API/session error or a root reply-tool call, with optional text such as prose followed by JSON, a fenced JSON block or bare JSON
- **THEN** the adapter reports a missing reply, writes no reply and the run stops with an execution failure
- **AND** the transcript distinguishes the completed OpenCode prompts from the adapter's missing-reply failure and the worker's implementation edits remain available for resume

#### Scenario: Follow-up prompt supplies a missing reply
- **WHEN** an OpenCode prompt completes without an API/session error after using other tools and without a root reply-tool call, such as Meta's Muse Spark ending its turn with text
- **THEN** the adapter sends one follow-up prompt in the same session with the worker's model, agent and variant selections, asking only for the reply-tool call
- **AND** the follow-up's completed root reply-tool call supplies the reply, and the usage file covers the model steps of both prompts

#### Scenario: Failed OpenCode prompt gets no follow-up
- **WHEN** an OpenCode prompt ends with an API, response or session error, an unexpected harness exit or an interruption
- **THEN** the adapter sends no follow-up prompt and the worker ends with the existing execution failure

#### Scenario: Per-worker schema and inherited settings
- **WHEN** an OpenCode worker starts with a supplied schema and existing user or project configuration, including inline configuration
- **THEN** the worker's reply tool describes that schema and accepts its reply object as a JSON string, its configured model, agent, restrictions and unrelated settings are preserved, and no user or project configuration file is changed
- **AND** a reply-tool call from a delegated session does not supply the reply

#### Scenario: Unsupported OpenCode arguments
- **WHEN** an OpenCode worker command supplies an unsupported argument, such as `--attach`, `--session`, `--continue`, `--command` or `--dir`
- **THEN** the adapter names that argument and fails before starting the harness rather than silently changing the session, directory, restrictions or reply protocol

#### Scenario: Pure OpenCode still enforces its schema
- **WHEN** pure mode is enabled through a supported argument or the environment
- **THEN** OpenCode retains pure-mode behavior and the worker can still reply through the reply tool, whose decoded object the loop checks against the schema

#### Scenario: Provider that accepts only automatic tool choice
- **WHEN** the worker's model is served by a provider that rejects forced tool choices, such as Meta's Muse Spark
- **THEN** the worker prompt carries no forced tool choice and the root session's reply-tool call supplies the reply

#### Scenario: Reply-tool call missing a required property
- **WHEN** the root session calls the reply tool with a string encoding an object that omits a required property of the worker schema, such as `{}` for a schema that requires `planProblem`
- **THEN** the tool returns an error naming the missing properties to the model, and that call does not supply the reply
- **AND** a later complete reply-tool call in the same turn supplies the reply, while a turn that ends without one receives the follow-up prompt and is reported as a missing reply only when the follow-up also ends without one

#### Scenario: Reply-tool arguments that break the schema
- **WHEN** the root session calls the reply tool with a string encoding an object that has every required top-level property of the worker schema but a value the schema does not allow
- **THEN** the adapter writes that decoded object as the reply and the loop's reply validation rejects it as an execution failure

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

#### Scenario: Nullable implementation reply survives tool transport
- **WHEN** the root session completes a reply-tool call with `reply` containing the JSON string `{"planProblem":null}`
- **THEN** the reply file contains the object `{"planProblem":null}` with actual JSON null
- **AND** the loop accepts it as implementation completion rather than a plan problem

#### Scenario: Nested nullable reply values survive tool transport
- **WHEN** the root session completes a reply-tool call encoding a review finding with `question` set to JSON null
- **THEN** the decoded finding retains that null value and the loop checks it against the existing review schema

#### Scenario: Empty acknowledgement object
- **WHEN** the worker schema accepts an empty acknowledgement and the root session completes a reply-tool call with `reply` set to the string `"{}"`
- **THEN** the reply file contains the empty JSON object

#### Scenario: Malformed reply transport
- **WHEN** the root session calls the reply tool without a string `reply`, with malformed JSON in it, or with JSON encoding null, an array or another non-object value
- **THEN** the tool returns an error identifying the transport problem to the model and that call supplies no reply
- **AND** a later complete call can supply the reply in that turn without another worker invocation
