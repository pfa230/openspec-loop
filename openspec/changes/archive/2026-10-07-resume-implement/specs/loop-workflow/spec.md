## MODIFIED Requirements

### Requirement: Run control

The loop SHALL provide deterministic `run`, `status`, `stop` and `resume` commands. `run` SHALL exit with a report when the run completes or stops; a stop report SHALL name the step that stopped, the observed cause such as the verdict, check output or exit status, and the recovery available. The loop SHALL NOT investigate failures itself. Stop SHALL end the current step at once. Anything that blocks progression SHALL stop the run and report why, and a stopped run SHALL advance only on an explicit resume. Resume SHALL continue from the first incomplete stage without repeating complete ones. `loop resume <change> --implement` SHALL first make implementation and every later stage incomplete, so the implementer implements the plan as it stands on the run's branch, from the work already there; it SHALL leave proposal review as it is, and the loop SHALL NOT detect plan edits or reopen implementation for them itself. Once the change is archived, `--implement` SHALL refuse and leave the run as it was. After an interruption around archival, merge, push or pull request creation, resume SHALL inspect the effects that actually happened and SHALL NOT replay them blindly. Resume SHALL NOT take over a run while the step its dead advancing process started is still running: it SHALL refuse, name that step's process group and the dead process, and leave the run as it was. Resume SHALL NOT end that step itself. The loop records each step's process group as the step starts, so a process that dies before recording it leaves that step unchecked.

#### Scenario: Resume after interrupted merge
- **WHEN** a run was interrupted after its merge completed and the user resumes it
- **THEN** the loop detects the completed merge and does not merge again

#### Scenario: Resume after interrupted archival
- **WHEN** a run was interrupted after OpenSpec archived the change but before the loop committed the result, and the user resumes it
- **THEN** the loop commits the archived change without running OpenSpec's archive again

#### Scenario: Resume after the pull request opened
- **WHEN** a run was interrupted after its pull request opened and the user resumes it
- **THEN** the loop reports the open pull request and does not open another

#### Scenario: Plan edited while stopped
- **WHEN** a person changes the plan while a run is stopped after implementation completed, and resumes it
- **THEN** the run resumes where it stopped without reviewing the plan again

#### Scenario: Implementation reopened after a plan edit
- **WHEN** a person commits a plan change on the run's branch while the run is stopped after implementation completed, and runs `loop resume <change> --implement`
- **THEN** the implementer implements the edited plan from the work already on the branch, the required checks and implementation review run again, the run continues through integration, and the plan is not reviewed again

#### Scenario: Implementation reopened before plan approval
- **WHEN** a run stopped at proposal review is resumed with `--implement`
- **THEN** the plan is reviewed before the implementer runs

#### Scenario: Implementation reopened after archival
- **WHEN** the user runs `loop resume <change> --implement` for a run whose change is archived
- **THEN** the loop refuses, says the change is archived, and leaves the run as it was

#### Scenario: Stop
- **WHEN** the user stops a run during an implementer turn
- **THEN** the turn ends, the run reports how to resume, and resume redoes the interrupted step

#### Scenario: Run already exists
- **WHEN** the user runs `loop run` for a change that already has a run
- **THEN** the loop refuses and names `loop status` and `loop resume` for that run

#### Scenario: Advancing process died
- **WHEN** the process advancing a run dies without stopping the run, its step has ended, and the user resumes it
- **THEN** the loop takes over the run and treats the step that was in progress as interrupted

#### Scenario: Step outlives its advancing process
- **WHEN** the process advancing a run is killed with SIGKILL during a step, the step keeps running, and the user resumes the run
- **THEN** the loop refuses, names the step's process group and the dead process, and starts no step; once that group has exited, resume takes the run over
