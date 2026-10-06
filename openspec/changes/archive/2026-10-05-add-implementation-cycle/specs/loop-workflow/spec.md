## MODIFIED Requirements

### Requirement: Implementation cycle

The controller SHALL run implementation as a cycle: implement, run the required checks, review the implementation, and revise as required. The implementer SHALL work from the change's native OpenSpec apply instructions, including the apply guidance the repository's OpenSpec configuration sets. The required checks SHALL be the commands listed in the loop configuration. A missing list SHALL refuse the run; an explicitly empty list SHALL mean the run has no required checks. A check that runs and fails SHALL be a check result, not an execution failure: its output SHALL return to the implementer as findings for the next attempt, and implementation review SHALL wait until the checks pass. When the checks fail after approved minor implementation fixes, the approval SHALL lapse and the failure SHALL return to the implementer as for any failed check. Implementation review SHALL judge whether the change's patch implements the whole approved plan, stays within it, and keeps the decisions recorded in the design. Implementation SHALL stay within the approved plan. Repairs SHALL be limited to failures the change caused; a failure the change did not cause SHALL NOT authorize unrelated or pre-existing repairs, so it persists until attempts run out.

#### Scenario: Change breaks a check
- **WHEN** a required check fails after implementation
- **THEN** the failure output returns to the implementer, and after the revision the checks run again before implementation review

#### Scenario: Pre-existing failure
- **WHEN** the same required-check failure also occurs on the base the change started from
- **THEN** the implementer does not expand the change to fix it, and the run stops when attempts run out

#### Scenario: No check list configured
- **WHEN** the loop configuration has no required check list
- **THEN** the loop refuses to start the run and says the list is missing

#### Scenario: Implementation review requests changes
- **WHEN** the implementation reviewer returns `REVISE`
- **THEN** the implementer revises, the required checks run again, and the implementation is reviewed again

#### Scenario: Minor fixes break a check
- **WHEN** the implementation reviewer returns `APPROVE` with minor findings and a required check fails after the implementer applies them
- **THEN** the approval lapses, the failure output returns to the implementer in the next attempt, and that attempt's patch is reviewed again after the checks pass

#### Scenario: Repository apply guidance
- **WHEN** the repository's OpenSpec configuration sets apply guidance
- **THEN** the implementer's instructions include that guidance
