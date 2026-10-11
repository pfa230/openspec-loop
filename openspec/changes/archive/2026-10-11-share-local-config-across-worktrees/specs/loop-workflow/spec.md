# Spec Delta

## MODIFIED Requirements

### Requirement: Loop configuration

The loop SHALL read `openspec/loop.yaml` from the invoking checkout on every `loop run`, `loop resume` and `loop step`. It SHALL then apply `openspec/loop.local.yaml` from the clone's main checkout when present, followed by that file from the invoking checkout when present and distinct. The main checkout SHALL be Git's primary working tree, independently of its checked-out branch or the configured default branch. A clone initialized as bare has no main checkout and SHALL use only the invoking checkout's local file. If a non-bare clone's main checkout cannot be located or accessed, the command SHALL refuse and name the problem rather than omit its overrides. Each later file SHALL replace settings from earlier files: a top-level setting as a whole, and `agents`, `roles` and `attempts` entry by entry. Each existing file SHALL be validated independently before merging; required fields SHALL be checked after all applicable files are combined. The configuration SHALL name the default branch, and the loop SHALL take it from the configuration and SHALL NOT detect it. The configuration SHALL name the worktrees directory, under which enrollment through `loop run` or `loop step` on the default branch creates the change's worktree at `<directory>/<change>`. A relative worktrees directory SHALL resolve against the checkout where enrollment through `loop run` or `loop step` is requested, and an absolute one SHALL be used as given. A run SHALL keep the worktree it was created with. The loop SHALL NOT change Git's ignore files or configuration. A missing `openspec/loop.yaml`, unparseable YAML, an unknown key or a value of the wrong type in any applicable file SHALL refuse the command and name the problem and the file. A required field missing after the files are combined SHALL refuse the command and name the field.

#### Scenario: Configuration missing
- **WHEN** the user runs `loop run` in a checkout without `openspec/loop.yaml`
- **THEN** the loop refuses the run and names the missing file

#### Scenario: Unknown key
- **WHEN** the configuration contains a key the loop does not know, such as a misspelled field name
- **THEN** the loop refuses the command and names the key

#### Scenario: Configured default branch
- **WHEN** the configuration names `trunk` as the default branch and the user runs `loop run` on `trunk`
- **THEN** the loop creates the change's branch from `trunk`, whatever the remote's HEAD points to

#### Scenario: Configuration changed while stopped
- **WHEN** the user edits the configuration while a run is stopped and then resumes it
- **THEN** the resumed run uses the edited configuration

#### Scenario: Local override
- **WHEN** `openspec/loop.local.yaml` defines an agent and assigns it to the proposal reviewer, and the committed file assigns another agent to that role and defines the plan reviser
- **THEN** the proposal reviewer uses the local agent and the plan reviser keeps the committed assignment

#### Scenario: Relative worktrees directory
- **WHEN** the configuration names `.worktrees` as the worktrees directory and the user runs `loop run` on the default branch
- **THEN** the loop creates the change's worktree at `.worktrees/<change>` under the checkout where `loop run` was given

#### Scenario: Absolute worktrees directory
- **WHEN** the configuration names an absolute worktrees directory outside the repository and the user runs `loop run` on the default branch
- **THEN** the loop creates the change's worktree at `<directory>/<change>`

#### Scenario: Worktrees directory changed while stopped
- **WHEN** the user changes the worktrees directory while a run is stopped and then resumes it
- **THEN** the resumed run continues in the worktree it was created with

#### Scenario: Worktrees directory not ignored
- **WHEN** the worktrees directory lies inside the invoking checkout and Git does not ignore it, and the user runs `loop run` on the default branch
- **THEN** the loop creates the change's worktree without changing any Git ignore file or configuration, and the checkout shows it as untracked

#### Scenario: Fresh issue worktree inherits shared overrides
- **WHEN** a committed change is run or enrolled through step in a fresh linked issue worktree without a local file, and the main checkout's ignored local file defines agents, roles, checks, delivery and attempt overrides
- **THEN** the run uses those overrides without requiring a copy or symlink in the issue worktree

#### Scenario: Invoking worktree retains its committed settings
- **WHEN** the invoking worktree's committed configuration differs from the main checkout's committed configuration and the main checkout supplies local overrides
- **THEN** the loop combines the invoking worktree's committed settings with the shared overrides and does not read the main checkout's committed configuration

#### Scenario: Worktree overrides take precedence
- **WHEN** the main checkout's local file defines multiple settings and the invoking worktree's local file sets only one agent, role, attempt budget or top-level setting
- **THEN** the invoking worktree's entries win and other shared entries remain; a top-level setting such as checks is replaced as a whole

#### Scenario: Shared configuration reread from another worktree
- **WHEN** the user edits the main checkout's local file between advancements and continues through resume or step from a linked worktree
- **THEN** the continuation uses the edited shared settings and retains the run's recorded worktree

#### Scenario: Shared file missing
- **WHEN** the main checkout is accessible but has no local file
- **THEN** the loop uses the invoking checkout's committed configuration and any invoking-worktree local overrides

#### Scenario: Invalid shared configuration cannot be masked
- **WHEN** a shared local file is unreadable or contains invalid YAML, an unknown key or a wrong type, even if the invoking worktree overrides the offending setting
- **THEN** the command refuses before advancing and names the shared file's actual path and problem

#### Scenario: Main checkout uses another branch
- **WHEN** the main checkout is detached or holds another branch, while the configured default branch is checked out elsewhere or nowhere
- **THEN** the shared overrides still come from the primary checkout's local file

#### Scenario: Main checkout cannot be located
- **WHEN** a linked worktree belongs to a non-bare clone whose primary checkout cannot be located or accessed
- **THEN** the loop refuses with the location problem instead of continuing with different configuration

#### Scenario: Bare clone has no shared main checkout
- **WHEN** the invoking checkout is a linked worktree of a clone initialized as bare
- **THEN** the loop reads the invoking checkout's committed configuration and optional local file without inventing a main checkout
