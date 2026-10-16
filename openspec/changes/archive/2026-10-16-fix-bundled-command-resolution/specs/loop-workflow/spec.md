# Spec Delta

## ADDED Requirements

### Requirement: CLI launch directory

Before resolving or running commands, the CLI SHALL append the directory used to launch its executable to the inherited PATH, preserving existing entries and their order. Workers SHALL inherit that PATH. The launch directory SHALL refer to the invoked path rather than its symlink target. An unset PATH SHALL become the launch directory alone.

#### Scenario: Installation bin directory missing from PATH
- **WHEN** the installed `loop` is invoked by path from a linked worktree, its installation bin directory is absent from PATH, and external prerequisites are available
- **THEN** sibling adapter commands are found through the existing PATH lookup and workers inherit the augmented PATH

#### Scenario: Existing PATH command takes precedence
- **WHEN** an earlier inherited PATH entry supplies a configured command also present beside the invoked `loop`
- **THEN** the earlier command remains selected

#### Scenario: Symlink invocation
- **WHEN** the invoked `loop` is a link from an installation bin directory to a JavaScript file inside its package
- **THEN** the appended directory is the installation bin directory

#### Scenario: Wrapped adapter retains its command name
- **WHEN** an agent uses `[loop-jail, loop-opencode, --auto]` after the CLI adds its launch directory to PATH
- **THEN** the wrapper receives the inherited PATH and continues passing `loop-opencode` to ai-jail with its existing arguments and mapping behavior
- **AND** ai-jail's existing `[commands.loop-opencode]` settings continue to apply
