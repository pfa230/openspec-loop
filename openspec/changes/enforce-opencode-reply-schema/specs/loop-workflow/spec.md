## MODIFIED Requirements

### Requirement: Shipped adapters

The loop SHALL ship worker commands for Claude Code, Codex, Antigravity and OpenCode. Each SHALL run its harness headless in the run's worktree with the agent's remaining arguments passed to the harness, and SHALL write the harness's final answer as the reply. Each adapter SHALL use its harness's own schema enforcement. The OpenCode adapter SHALL request native structured output with the supplied worker schema and SHALL write only the successful native structured result as its reply, without parsing text messages for a reply. Enabling that format SHALL be scoped to the worker process, preserve existing configuration and restrictions, and require no persistent configuration edits. Settings that disable or bypass this enablement SHALL fail explicitly rather than be discarded or weaken restrictions. An absent successful native result after a zero child exit SHALL be reported as missing native output even when text contains a schema-conforming object. A nonzero child exit SHALL retain the existing harness-exit failure reporting. The adapter SHALL NOT repair text or launch another worker turn. Each adapter SHALL write every numeric consumption counter from its harness's reported usage or token object and any explicitly reported USD cost to the usage file, under the harness's own names and nested paths, before it judges the harness's exit, and SHALL write no value the harness does not report. Counter collection SHALL NOT be restricted to a fixed list of names. An adapter SHALL preserve its harness's final-summary or per-step accounting boundary, without adding repeated cumulative snapshots together. Usage collection SHALL use the existing worker invocation's output and SHALL NOT add an auxiliary command, API lookup, pricing calculation or inference run. Unrelated event fields and nonnumeric metadata SHALL remain in the transcript rather than being treated as summable consumption counters.

#### Scenario: Harness arguments pass through
- **WHEN** the proposal reviewer's agent is `loop-codex` with a model and a sandbox argument
- **THEN** Codex runs with that model and sandbox, and its schema-conforming answer reaches the loop as the reply

#### Scenario: OpenCode cut report stays out of the reply
- **WHEN** a successful OpenCode turn emits a required cut report as text and returns a native structured result matching the worker schema
- **THEN** the adapter writes only that structured result as the reply and keeps the cut report in the transcript
- **AND** the loop can continue its existing commit, required-check and review sequence

#### Scenario: Harness without schema enforcement
- **WHEN** OpenCode supplies no successful schema-enforced result and exits zero, with optional text such as prose followed by JSON, a fenced JSON block or bare JSON
- **THEN** the adapter reports missing native structured output, writes no reply and the run stops with an execution failure
- **AND** the transcript distinguishes the successful OpenCode process from the adapter's failure and the worker's implementation edits remain available for resume

#### Scenario: Per-worker schema and inherited settings
- **WHEN** an OpenCode worker starts with a supplied schema and existing user or project configuration, including inline configuration
- **THEN** the worker's native output uses that schema, its configured model, agent, restrictions and unrelated settings are preserved, and no user or project configuration file is changed
- **AND** delegated sessions are not assigned the root worker's reply schema

#### Scenario: Settings prevent native enforcement
- **WHEN** pure mode is enabled through argv or the environment, or `--attach` targets a server including localhost
- **THEN** the adapter names the incompatible setting and fails without stripping it or accepting a text reply

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
