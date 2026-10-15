## MODIFIED Requirements

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
