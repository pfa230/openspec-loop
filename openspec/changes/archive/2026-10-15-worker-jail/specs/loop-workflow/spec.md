## ADDED Requirements

### Requirement: Shipped sandbox wrapper

The loop SHALL ship a worker command, `loop-jail`, that runs the worker command given as its arguments under ai-jail. Inside the jail the worker SHALL be able to write the run's worktree and a private `/tmp` and home discarded when it ends, reach the network, and run the wrapped command, its harness and `openspec`. The wrapper SHALL exit with the wrapped command's status. A missing `ai-jail` SHALL be an execution failure that names it.

#### Scenario: Jailed worker does its work
- **WHEN** an implementer's agent is `[loop-jail, loop-opencode, --auto]`
- **THEN** the worker edits the worktree, runs the required checks and `openspec validate`, and writes a headless browser screenshot to `/tmp`, and its reply reaches the loop

#### Scenario: Jailed worker cannot write outside its jail
- **WHEN** a jailed worker writes to a file in the user's home directory outside the worktree
- **THEN** the write does not reach the host

#### Scenario: Wrapped command fails
- **WHEN** the wrapped command exits with status 3
- **THEN** `loop-jail` exits with status 3 and the step is an execution failure

#### Scenario: ai-jail is not installed
- **WHEN** `loop-jail` runs and no `ai-jail` command is on PATH
- **THEN** the worker fails with an error naming `ai-jail` and the run stops with an execution failure

### Requirement: Sandboxed repository metadata

A jailed worker SHALL be able to read the repository's Git metadata but SHALL NOT be able to write the repository's Git directory or the worktree's `.git` file. The wrapper SHALL deliver the reply and usage the wrapped command writes to the paths the loop appended, whether the command succeeds or fails.

#### Scenario: Git reads work
- **WHEN** a jailed worker runs `git status` and `git diff` in the worktree
- **THEN** both report the worktree's state

#### Scenario: Git hooks and configuration stay unchanged
- **WHEN** a jailed worker writes a hook into the repository's Git directory, changes its configuration, or rewrites the worktree's `.git` file
- **THEN** each write fails and the host's Git metadata is unchanged

#### Scenario: Reply and usage reach the loop
- **WHEN** a jailed adapter writes its reply and usage and exits
- **THEN** the loop reads them at the reply and usage paths it appended, even when the adapter exits nonzero

### Requirement: Sandboxed harness files

For the shipped adapters, the wrapper SHALL share the harness's credential file writable, so that token refresh persists, and the harness's executable and user configuration read-only. Everything else the harness writes in the home directory SHALL be discarded when the worker ends.

#### Scenario: Harness starts authenticated
- **WHEN** a jailed `loop-claude`, `loop-codex`, `loop-agy` or `loop-opencode` worker starts on a host where its harness is logged in
- **THEN** the harness runs authenticated, with the user's configuration, and completes the worker's step

#### Scenario: Harness configuration stays unchanged
- **WHEN** a jailed worker writes to its harness's configuration
- **THEN** the write fails and the configuration on the host is unchanged
