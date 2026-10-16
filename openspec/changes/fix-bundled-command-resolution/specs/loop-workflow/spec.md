# Spec Delta

## ADDED Requirements

### Requirement: Bundled worker command resolution

Bare `loop-claude`, `loop-codex`, `loop-agy`, `loop-opencode` and `loop-jail` worker commands SHALL select the executing package's files independently of PATH, the current directory and npm's global prefix. Other bare commands SHALL use PATH; commands containing `/` SHALL use the specified absolute path or resolve relative to the invoking checkout. An unavailable bundled file SHALL fail naming its path without selecting a different installation.

#### Scenario: Installed adapters absent from PATH
- **WHEN** a running installed `loop` resolves roles using bundled commands while its installation's bin directory is absent from PATH
- **THEN** each bundled command resolves to that executing package's installed file
- **AND** external prerequisites must still be available as required by their existing contracts

#### Scenario: PATH contains another installation
- **WHEN** PATH contains a command with a bundled worker name from a different installation
- **THEN** the bare name still selects the executing package's file

#### Scenario: Explicit custom command
- **WHEN** an agent names an absolute command path or a relative command containing `/`, including a different installation's adapter
- **THEN** the specified command is used and relative paths resolve against the invoking checkout

#### Scenario: Custom command on PATH
- **WHEN** an agent names a bare command other than the five bundled worker names
- **THEN** it resolves through PATH in order, including relative and empty PATH entries, and an unavailable command receives the existing refusal naming its role and alias

#### Scenario: Executing package relocated
- **WHEN** the executing package is outside the invoking repository and npm's current global prefix names another installation
- **THEN** bundled worker commands resolve from the executing package's location

#### Scenario: Bundled file unavailable
- **WHEN** the executing package's selected worker file is missing or is not executable, even though PATH contains a command with the same name
- **THEN** role resolution refuses naming the role, alias and unavailable package file without running the PATH command

### Requirement: Bundled commands inside the sandbox wrapper

`loop-jail` SHALL resolve a wrapped bare bundled worker name from its own executing package before mapping and invoking it. It SHALL retain the shipped adapter's harness identification, credential sharing and executable maps. Other wrapped commands SHALL retain their existing PATH or explicit-path semantics. An unavailable bundled file SHALL fail naming its path without selecting a PATH alternative.

#### Scenario: Jailed adapter absent from PATH
- **WHEN** an agent uses `[loop-jail, loop-opencode, --auto]` and the package's bin directory is absent from PATH while external prerequisites are available
- **THEN** the wrapper invokes its own packaged OpenCode adapter by absolute path with its arguments preserved
- **AND** it maps that adapter's package and the harness and OpenSpec executable chains read-only and retains OpenCode's existing credential and configuration shares

#### Scenario: Wrapped bundled file unavailable
- **WHEN** the wrapper's packaged adapter file is unavailable but PATH contains the same adapter name
- **THEN** the wrapper fails naming the package file without invoking the PATH command

#### Scenario: Custom wrapped command
- **WHEN** the wrapped command is a custom bare name or an explicit path
- **THEN** the wrapper retains the existing command lookup, executable mapping, reply relay and exit-status behavior
