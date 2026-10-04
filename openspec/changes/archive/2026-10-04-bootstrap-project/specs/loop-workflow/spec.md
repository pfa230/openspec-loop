## ADDED Requirements

### Requirement: OpenSpec CLI

The loop SHALL run OpenSpec through the `openspec` command on PATH, the same CLI the user runs by hand, and SHALL work with the repository's native OpenSpec setup without installing a custom schema. When `loop run` or `loop resume` starts, the loop SHALL refuse if `openspec` is missing or older than 1.14.0, naming the version found and the minimum. The loop SHALL set no upper version bound.

#### Scenario: OpenSpec too old
- **WHEN** the `openspec` on PATH reports version 1.9.0 and the user runs `loop run`
- **THEN** the loop refuses the run and names 1.9.0 and the minimum 1.14.0

#### Scenario: OpenSpec missing
- **WHEN** no `openspec` command is on PATH and the user runs `loop run`
- **THEN** the loop refuses the run and says `openspec` was not found

#### Scenario: Newer OpenSpec
- **WHEN** the `openspec` on PATH reports a version above 1.14.0, including a new major version
- **THEN** the loop runs with it without a version refusal

#### Scenario: Native setup only
- **WHEN** a repository has only native OpenSpec setup with its default schema
- **THEN** `loop run` needs no loop-specific schema or OpenSpec configuration
