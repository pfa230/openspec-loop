## MODIFIED Requirements

### Requirement: Sandboxed repository metadata

A jailed worker SHALL be able to read the repository's Git metadata but SHALL NOT be able to write the repository's Git directory or the worktree's `.git` file. The wrapper SHALL deliver the reply and usage the wrapped command writes to the paths the loop appended, whether the command succeeds or fails. The wrapper SHALL deliver a relayed file only when it is a regular file, without following a symlink. A relayed file that exists but is not a regular file SHALL make the wrapper fail with an error naming it instead of exiting with the wrapped command's status.

#### Scenario: Git reads work
- **WHEN** a jailed worker runs `git status` and `git diff` in the worktree
- **THEN** both report the worktree's state

#### Scenario: Git hooks and configuration stay unchanged
- **WHEN** a jailed worker writes a hook into the repository's Git directory, changes its configuration, or rewrites the worktree's `.git` file
- **THEN** each write fails and the host's Git metadata is unchanged

#### Scenario: Reply and usage reach the loop
- **WHEN** a jailed adapter writes its reply and usage and exits
- **THEN** the loop reads them at the reply and usage paths it appended, even when the adapter exits nonzero

#### Scenario: Relayed file is not a regular file
- **WHEN** a jailed worker replaces its reply with a symlink to a host file or its usage with a FIFO, and exits 0
- **THEN** neither is delivered, the wrapper exits nonzero with an error naming both
