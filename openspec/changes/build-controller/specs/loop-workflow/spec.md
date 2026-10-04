## ADDED Requirements

### Requirement: Loop configuration

The loop SHALL read its configuration from `openspec/loop.yaml` in the checkout where `loop run` or `loop resume` is given, each time either is given. The configuration SHALL name the default branch, and the loop SHALL take it from the configuration and SHALL NOT detect it. A missing file, unparseable YAML, a missing field, an unknown key or a value of the wrong type SHALL refuse the command and name the problem.

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

## MODIFIED Requirements

### Requirement: Explicit enrollment

A run SHALL act only on the change named in `loop run`, and its responsibility SHALL cover only that change and the result it delivers. The loop SHALL refuse a run whose proposal is not committed on the change's branch, as defined in Integration and delivery, and a run that would use the invoking worktree while it has uncommitted changes. OpenSpec artifacts, commits and native OpenSpec commands outside a run SHALL NOT enroll work, and the loop SHALL NOT enforce rules on them. The loop SHALL install no git hooks and SHALL NOT police repository-wide OpenSpec edits or archives.

#### Scenario: Run enrolls one change
- **WHEN** the user runs `loop run` with a change whose proposal is committed on the change's branch
- **THEN** the loop starts a run owning that change and no other

#### Scenario: Proposal not on the default branch
- **WHEN** the user runs `loop run` on the default branch with a change whose proposal is not committed there
- **THEN** the loop refuses the run and says where the proposal must be

#### Scenario: Proposal not on the change branch
- **WHEN** the user runs `loop run` on a branch other than the default branch with a change whose proposal is not committed on that branch
- **THEN** the loop refuses the run and says where the proposal must be

#### Scenario: Uncommitted changes in the worktree
- **WHEN** the user runs `loop run` on a branch other than the default branch and that worktree has uncommitted changes
- **THEN** the loop refuses the run and names the worktree

#### Scenario: Native work outside a run
- **WHEN** someone creates, edits, archives or deletes an OpenSpec change outside any run
- **THEN** the loop neither blocks nor checks that work

### Requirement: Attended proposal

Proposals SHALL be native OpenSpec artifacts authored with the user through native OpenSpec proposing and committed on the change's branch: on the default branch before the run branches from it, or on a branch of its own. The decisions the plan depends on SHALL be recorded in the design. The loop SHALL accept a committed proposal as it is.

#### Scenario: Proposal from native proposing
- **WHEN** the user writes a proposal with native `/opsx:propose`, commits it on the default branch and runs `loop run` there
- **THEN** `loop run` accepts the change without further preparation

#### Scenario: Proposal on its own branch
- **WHEN** the user proposes in a worktree on a branch of its own, commits the proposal there and runs `loop run` in that worktree
- **THEN** the run proceeds in that worktree without further preparation

### Requirement: Integration and delivery

The run SHALL work on the change's branch. When `loop run` is given on a branch other than the default branch, that branch is the change's branch and the run works in its worktree; when it is given on the default branch, the loop creates the change's branch from that commit in a worktree of its own. The run SHALL preserve unrelated work in every checkout. The base, which the loop integrates the change with and delivers it to, is the remote's default branch in `pr` mode and the local default branch in `local` and `merge` modes. Before the pre-archive gate, the loop SHALL integrate the change with the current base; a conflict or a failed required check SHALL return to the implementer as findings. Only `merge` mode SHALL change the local default branch, and only by fast-forward when every checkout holding it is clean; otherwise the run SHALL stop and name the checkout. Before integrating in `merge` mode, the loop SHALL fast-forward a local default branch that is behind its remote, and SHALL stop the run when it is ahead or has diverged. Every action outside the run's worktree, such as updating or pushing a branch or opening a pull request, SHALL be reported as its own progress line. The configuration SHALL select one delivery mode: `local`, where the run stops with the archived change committed on its branch and pushes nothing; `pr`, where the loop pushes the change branch and opens a pull request on the repository's GitHub remote; or `merge`, where the loop fast-forwards the default branch to the change branch and pushes it. A failed fast-forward or a rejected push SHALL stop the run.

#### Scenario: Run on the default branch
- **WHEN** the user runs `loop run` on the default branch
- **THEN** the loop creates a new branch for the change from that commit in a worktree of its own, and enrollment leaves the default branch and the invoking checkout untouched

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

### Requirement: Run control

The loop SHALL provide deterministic `run`, `status`, `stop` and `resume` commands. `run` SHALL exit with a report when the run completes or stops; a stop report SHALL name the step that stopped, the observed cause such as the verdict, check output or exit status, and the recovery available. The loop SHALL NOT investigate failures itself. Stop SHALL end the current step at once. Anything that blocks progression SHALL stop the run and report why, and a stopped run SHALL advance only on an explicit resume. A stage SHALL count as complete only while its result applies to the current inputs; an input change that invalidates an approval SHALL make that stage and every later stage incomplete again. Resume SHALL continue from the first incomplete stage without repeating complete ones. After an interruption around archival, merge, push or pull request creation, resume SHALL inspect the effects that actually happened and SHALL NOT replay them blindly.

#### Scenario: Resume after interrupted merge
- **WHEN** a run was interrupted after its merge completed and the user resumes it
- **THEN** the loop detects the completed merge and does not merge again

#### Scenario: Plan edited while stopped
- **WHEN** the plan changes while a run is stopped after implementation review, and the user resumes it
- **THEN** the run resumes at proposal review instead of archival

#### Scenario: Stop
- **WHEN** the user stops a run during an implementer turn
- **THEN** the turn ends, the run reports how to resume, and resume redoes the interrupted step

#### Scenario: Run already exists
- **WHEN** the user runs `loop run` for a change that already has a run
- **THEN** the loop refuses and names `loop status` and `loop resume` for that run

#### Scenario: Advancing process died
- **WHEN** the process advancing a run dies without stopping the run, and the user resumes it
- **THEN** the loop takes over the run and treats the step that was in progress as interrupted
