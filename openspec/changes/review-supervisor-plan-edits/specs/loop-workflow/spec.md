## ADDED Requirements

### Requirement: Explicit proposal review restart

`loop resume <change> --review` SHALL reopen proposal review and every later stage, starting with a fresh review of the current plan and retaining the work already on the run's branch. Once the change is archived, `--review` SHALL refuse and leave the run as it was.

#### Scenario: Review restarted for an edited plan
- **WHEN** a run has completed proposal review but has not archived its change, and is resumed with `--review` after a committed plan edit
- **THEN** proposal review runs again before implementation, and the run continues through its later stages from the existing branch work

#### Scenario: Review restart after archival
- **WHEN** a run whose change is archived is resumed with `--review`
- **THEN** the loop refuses and leaves the run as it was

### Requirement: Supervised plan edits return to review

The supervision skill SHALL commit plan changes it makes on the run's branch and use `loop resume <change> --review` when next advancing that run.

#### Scenario: Supervisor edits a stopped run's plan
- **WHEN** a supervising agent changes the plan to recover a run stopped during implementation
- **THEN** it commits the edit on the run's branch and resumes with `--review`, so proposal review precedes the next implementer turn
