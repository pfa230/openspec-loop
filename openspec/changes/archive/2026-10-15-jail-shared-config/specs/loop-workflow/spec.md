## MODIFIED Requirements

### Requirement: Shipped sandbox wrapper

The loop SHALL ship a worker command, `loop-jail`, that runs the worker command given as its arguments under ai-jail. Inside the jail the worker SHALL be able to write the run's worktree and a private `/tmp` and home discarded when it ends, reach the network, and run the wrapped command, its harness and `openspec`. The worker's `TMPDIR` SHALL name the jail's private `/tmp`. The wrapper SHALL exit with the wrapped command's status. A missing `ai-jail` SHALL be an execution failure that names it.

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

#### Scenario: Temporary files with a host TMPDIR
- **WHEN** the loop runs with `TMPDIR` set to a host directory and a jailed worker runs `mktemp`
- **THEN** the file is created under the jail's `/tmp`
