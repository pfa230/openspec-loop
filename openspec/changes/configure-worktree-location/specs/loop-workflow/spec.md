## MODIFIED Requirements

### Requirement: Loop configuration

The loop SHALL read its configuration from `openspec/loop.yaml` in the checkout where `loop run` or `loop resume` is given, each time either is given, and from `openspec/loop.local.yaml` beside it when that file exists. A value the local file sets SHALL replace the committed value: a top-level setting as a whole, and `agents`, `roles` and `attempts` entry by entry. The configuration SHALL name the default branch, and the loop SHALL take it from the configuration and SHALL NOT detect it. The configuration SHALL name the worktrees directory, under which `loop run` on the default branch creates the change's worktree at `<directory>/<change>`. A relative worktrees directory SHALL resolve against the checkout where `loop run` is given, and an absolute one SHALL be used as given. A run SHALL keep the worktree it was created with. The loop SHALL NOT change Git's ignore files or configuration. A missing `openspec/loop.yaml`, unparseable YAML, an unknown key or a value of the wrong type in either file SHALL refuse the command and name the problem and the file. A required field missing after the files are combined SHALL refuse the command and name the field.

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

### Requirement: Integration and delivery

The run SHALL work on the change's branch. When `loop run` is given on a branch other than the default branch, that branch is the change's branch and the run works in its worktree; when it is given on the default branch, the loop creates the change's branch from that commit in a worktree of its own. The run SHALL preserve unrelated work in every checkout. The base, which the loop integrates the change with and delivers it to, is the remote's default branch in `pr` mode and the local default branch in `local` and `merge` modes. Before the pre-archive gate, the loop SHALL integrate the change with the current base; a conflict or a failed required check SHALL return to the implementer as findings. Only `merge` mode SHALL change the local default branch, and only by fast-forward when every checkout holding it is clean; otherwise the run SHALL stop and name the checkout. Before integrating in `merge` mode, the loop SHALL fast-forward a local default branch that is behind its remote, and SHALL stop the run when it is ahead or has diverged. Every action outside the run's worktree, such as updating or pushing a branch or opening a pull request, SHALL be reported as its own progress line. The configuration SHALL select one delivery mode: `local`, where the run stops with the archived change committed on its branch and pushes nothing; `pr`, where the loop pushes the change branch and opens a pull request on the repository's GitHub remote; or `merge`, where the loop fast-forwards the default branch to the change branch and pushes it. A failed fast-forward or a rejected push SHALL stop the run.

#### Scenario: Run on the default branch
- **WHEN** the user runs `loop run` on the default branch
- **THEN** the loop creates a new branch for the change from that commit in a worktree of its own, and enrollment leaves the default branch and the invoking checkout's files and index untouched

#### Scenario: Run on a change branch
- **WHEN** the user runs `loop run` in a worktree on a branch of its own
- **THEN** the run commits on that branch in that worktree, in every delivery mode

#### Scenario: Local delivery
- **WHEN** the run completes in `local` mode
- **THEN** the archived change is committed on its branch, nothing is pushed and the default branch is untouched

#### Scenario: Pull request delivery
- **WHEN** the run completes in `pr` mode
- **THEN** the change branch is pushed, a pull request is open against the default branch and the local default branch is untouched

#### Scenario: Merge delivery
- **WHEN** the run completes in `merge` mode
- **THEN** the default branch is fast-forwarded to the change branch and pushed

#### Scenario: Clean integration
- **WHEN** the change integrates with a moved default branch without conflicts, its patch is unchanged and the required checks pass
- **THEN** the run continues to archival without another review

#### Scenario: Integration fails
- **WHEN** integration conflicts or a required check fails on the integrated result
- **THEN** the failure returns to the implementer as findings, and the fix is checked and reviewed before archival

#### Scenario: Default branch behind its remote
- **WHEN** in `merge` mode the local default branch is behind its remote and its checkout is clean
- **THEN** the loop fast-forwards it before integrating and reports the fast-forward as a progress line

#### Scenario: Dirty checkout
- **WHEN** the loop needs to change the default branch and a checkout holding it has uncommitted changes
- **THEN** the run stops before changing anything and names the checkout

#### Scenario: Unpushed commits on the default branch
- **WHEN** in `merge` mode the local default branch is ahead of its remote
- **THEN** the run stops instead of publishing those commits
