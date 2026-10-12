# Spec Delta

## ADDED Requirements

### Requirement: Project skill setup

The loop SHALL provide `loop setup`, accepting no arguments or options, to install every bundled skill into `.agents/skills/` and `.claude/skills/` in the invoking Git checkout's root. The executing package SHALL supply the skill contents independently of the current directory, PATH and npm's global prefix. Success SHALL print each installed destination and exit 0.

#### Scenario: Initial installation
- **WHEN** `loop setup` runs in an OpenSpec-initialized Git checkout with no bundled skill copies
- **THEN** both tool directories contain every skill from the executing package, including `openspec-loop` and `openspec-scope`, with the packaged contents
- **AND** the command prints their destination paths and exits 0

#### Scenario: Subdirectory invocation
- **WHEN** `loop setup` runs from a subdirectory of that checkout
- **THEN** it installs the skills at the checkout root, without creating tool directories in the subdirectory

#### Scenario: Linked worktree invocation
- **WHEN** `loop setup` runs in a linked worktree
- **THEN** it updates that worktree's skill directories and leaves other checkouts untouched

#### Scenario: Installed package supplies the skills
- **WHEN** the installed package is outside the invoking repository and npm's current global prefix points elsewhere
- **THEN** setup installs the skills supplied by the package whose `loop` command is executing

#### Scenario: Unsupported setup arguments
- **WHEN** `loop setup` is given any argument or option
- **THEN** it prints usage, exits 2 and writes no files

### Requirement: Bundled skill refresh

Rerunning `loop setup` SHALL replace existing bundled skill directories with the executing package's copies and add missing bundled skills. Replacement SHALL remove obsolete contents within those package-owned directories and overwrite local edits there. Setup SHALL preserve unrelated skill directories, native OpenSpec skills and files outside the bundled skill destinations. Repeated setup with the same package SHALL leave the same file contents.

#### Scenario: Upgrade adds the missing scoping skill
- **WHEN** a project has an older supervision skill and no scoping skill, and setup runs from a package bundling both
- **THEN** both tool directories receive the current supervision and scoping skills
- **AND** unrelated skills and native OpenSpec instructions remain unchanged

#### Scenario: Obsolete bundled files removed
- **WHEN** a bundled skill's project copy contains an obsolete file or local edit
- **THEN** setup replaces that skill directory with the packaged contents, removing the obsolete file and overwriting the edit

#### Scenario: Setup repeated
- **WHEN** setup is rerun after successful installation with the same package
- **THEN** the installed file contents remain identical and the command succeeds

### Requirement: Setup boundaries and failures

Setup SHALL require a Git working tree, without loading loop configuration, requiring an OpenSpec root or resolving workers. It SHALL refuse with exit 2 before writing when the project is unsuitable or a destination directory path is a file or symlink, naming the problem. A source or copy failure SHALL exit 1 and name the failing path. Setup SHALL change no configuration, Git refs, index, run state or user-level skill directories, and SHALL enroll no run.

#### Scenario: Project setup not yet complete
- **WHEN** setup runs in a Git checkout without an OpenSpec root, `openspec/loop.yaml` or configured worker executables
- **THEN** it installs the skills without requiring run preparation or creating OpenSpec or loop configuration

#### Scenario: Unsuitable project
- **WHEN** setup runs outside a Git working tree
- **THEN** it refuses with exit 2, identifies the missing prerequisite and creates no files

#### Scenario: Obstructed destination
- **WHEN** a path needed for a tool's skill directory or a bundled skill directory is occupied by a file or symlink
- **THEN** setup refuses before changing any destination and names the obstructing path
- **AND** it leaves the object and any symlink target untouched

#### Scenario: Installation fails
- **WHEN** a bundled source cannot be read or a destination cannot be written
- **THEN** setup exits 1, identifies the failing path and does not report successful completion
- **AND** a later explicit setup invocation can refresh all destinations after the cause is corrected

#### Scenario: Project configuration preserved
- **WHEN** setup succeeds in a configured project
- **THEN** loop configuration, OpenSpec configuration, ignore files, Git refs, the index and existing run state remain unchanged
- **AND** only the invoking checkout's bundled skill destinations are installed or refreshed
