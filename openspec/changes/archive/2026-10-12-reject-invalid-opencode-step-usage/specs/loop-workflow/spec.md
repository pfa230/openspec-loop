# Spec Delta

## MODIFIED Requirements

### Requirement: Shipped adapters

The loop SHALL ship worker commands for Claude Code, Codex, Antigravity and OpenCode. Each SHALL run its harness headless in the run's worktree and SHALL write the harness's final answer as the reply. Claude Code, Codex and Antigravity SHALL pass the agent's remaining arguments to the harness. OpenCode SHALL preserve model (`-m`/`--model`), agent, variant, explicit `--auto` permission approval and pure-mode selections through its supported API/server options, and SHALL name and reject unsupported arguments before starting the harness. Each adapter SHALL use its harness's own schema enforcement. The OpenCode adapter SHALL own one local harness process for one worker prompt, terminate it when the worker completes, fails or is interrupted, and SHALL request native structured output with the supplied worker schema and SHALL write only the successful native structured result as its reply, without parsing text messages for a reply. Enabling that format SHALL be scoped to the worker process, preserve existing configuration and restrictions, and require no persistent configuration edits. OpenCode SHALL retain headless denial of questions and plan-mode transitions, reject permission requests unless explicit auto approval is enabled, and preserve configured denies for both root and delegated sessions. Settings or arguments that cannot be honored SHALL fail explicitly rather than be discarded or weaken restrictions. An otherwise successful OpenCode prompt without a native result SHALL be reported as missing native output even when text contains a schema-conforming object. API or session errors and unexpected harness exits SHALL be execution failures; an unexpected nonzero harness exit SHALL preserve its status and reported usage. Expected shutdown of an owned server after a completed prompt SHALL NOT turn that prompt into a harness failure. The adapter SHALL NOT repair text or launch another worker turn. Each adapter SHALL write every numeric consumption counter from its harness's reported usage or token object and any explicitly reported USD cost to the usage file, under the harness's own names and nested paths, before it judges the harness's exit, and SHALL write no value the harness does not report. Counter collection SHALL NOT be restricted to a fixed list of names. An adapter SHALL preserve its harness's final-summary or per-step accounting boundary, without adding repeated cumulative snapshots together. When aggregating selected OpenCode model-step reports, the adapter SHALL preserve any negative or nonfinite numeric counter or reported USD cost as invalid in the usage file for existing worker validation; other model steps SHALL NOT cancel or hide it. Usage collection SHALL use the existing worker invocation's output, including its subscribed OpenCode event stream, and SHALL NOT add an auxiliary command, API lookup, pricing calculation or inference run. Unrelated event fields and nonnumeric metadata SHALL remain in the transcript rather than being treated as summable consumption counters.

#### Scenario: Harness arguments pass through
- **WHEN** the proposal reviewer's agent is `loop-codex` with a model and a sandbox argument
- **THEN** Codex runs with that model and sandbox, and its schema-conforming answer reaches the loop as the reply

#### Scenario: OpenCode cut report stays out of the reply
- **WHEN** a successful OpenCode turn emits a required cut report as text and returns a native structured result matching the worker schema
- **THEN** the adapter writes only that structured result as the reply and keeps the cut report in the transcript
- **AND** the loop can continue its existing commit, required-check and review sequence

#### Scenario: Harness without schema enforcement
- **WHEN** OpenCode's prompt completes without an API/session error or a successful schema-enforced result, with optional text such as prose followed by JSON, a fenced JSON block or bare JSON
- **THEN** the adapter reports missing native structured output, writes no reply and the run stops with an execution failure
- **AND** the transcript distinguishes the completed OpenCode prompt from the adapter's missing-result failure and the worker's implementation edits remain available for resume

#### Scenario: Per-worker schema and inherited settings
- **WHEN** an OpenCode worker starts with a supplied schema and existing user or project configuration, including inline configuration
- **THEN** the worker's native output uses that schema, its configured model, agent, restrictions and unrelated settings are preserved, and no user or project configuration file is changed
- **AND** delegated sessions are not assigned the root worker's reply schema

#### Scenario: Unsupported OpenCode arguments
- **WHEN** an OpenCode worker command supplies an unsupported argument, such as `--attach`, `--session`, `--continue`, `--command` or `--dir`
- **THEN** the adapter names that argument and fails before starting the harness rather than silently changing the session, directory, restrictions or reply protocol

#### Scenario: Pure OpenCode still enforces its schema
- **WHEN** pure mode is enabled through a supported argument or the environment
- **THEN** OpenCode retains pure-mode behavior and the worker still receives native schema enforcement through the prompt API

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
- **WHEN** a backend emits several cumulative final-summary snapshots or OpenCode emits several model-step usage records and repeated updates of the same record
- **THEN** the adapter uses the final applicable summary for a summary-reporting backend and sums corresponding counters and reported cost once per OpenCode model step using the latest report for that step
- **AND** it does not add a cumulative summary to the usage that summary already includes

#### Scenario: Numeric nested usage and metadata
- **WHEN** a usage object contains nested numeric consumption counters, an array of numeric consumption breakdowns, and metadata such as a service-tier string
- **THEN** the adapter preserves each numeric leaf under its dotted object path or array-index path in the counter map
- **AND** it leaves nonnumeric metadata in the transcript and does not turn it into a counter

#### Scenario: Invalid collected quantity
- **WHEN** collecting the numeric leaves of a backend's selected usage or token object produces a usage file containing a negative or nonfinite quantity
- **THEN** the existing malformed-usage validation rejects that file and the worker step is an execution failure
- **AND** the adapter does not silently remove an invalid numeric field to make the file pass validation

#### Scenario: Distinct OpenCode steps cannot cancel a negative counter
- **WHEN** the latest reports for two distinct OpenCode model steps contain `tool_requests` values of -1 and 5, in either order
- **THEN** the aggregated usage file retains an invalid value for that counter and existing malformed-usage validation makes the worker step an execution failure
- **AND** the adapter does not report a valid total of 4 or silently omit the counter

#### Scenario: Distinct OpenCode steps cannot cancel a nested negative counter
- **WHEN** the latest reports for two distinct OpenCode model steps contain `details.tool_requests` values of -1 and 5 in nested token objects, in either order
- **THEN** the usage file retains that native dotted path with an invalid value and existing malformed-usage validation makes the worker step an execution failure

#### Scenario: Distinct OpenCode steps cannot cancel negative cost
- **WHEN** the latest reports for two distinct OpenCode model steps contain explicitly reported USD costs of -1 and 5, in either order
- **THEN** the usage file retains an invalid reported cost and existing malformed-usage validation makes the worker step an execution failure
- **AND** the adapter does not report a valid cost of 4 or silently omit the cost

#### Scenario: Latest OpenCode step report remains the accounting boundary
- **WHEN** OpenCode updates one model step from a negative quantity to a valid final quantity and all selected latest reports contain finite non-negative quantities
- **THEN** the adapter sums the latest reports once per distinct model step and does not retain the superseded quantity as an additional report or failure
