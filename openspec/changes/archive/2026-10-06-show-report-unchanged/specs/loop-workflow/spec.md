## MODIFIED Requirements

### Requirement: Supervision skill

The loop SHALL ship a skill for Claude and Codex that supervises a run through the loop's commands. The skill SHALL start the run and forward each progress line to the user as it arrives. When the run completes or stops, the skill SHALL show the user its report unchanged. When the run stops, the skill SHALL diagnose the stop with the user from the report, the transcripts, the review and check findings and the changes between attempts: the likely cause, the evidence that is missing, why attempts did not converge when they ran out, and a recovery. The skill SHALL change nothing while diagnosing, and SHALL repair or resume only with the user's agreement.

#### Scenario: Progress forwarded
- **WHEN** a supervised run starts a step
- **THEN** the user sees that step's progress line in the session as it is printed

#### Scenario: Report shown unchanged
- **WHEN** a supervised run completes or stops
- **THEN** the user sees the report in the session as the loop printed it

#### Scenario: Attempts did not converge
- **WHEN** a supervised run stops with exhausted implementation attempts
- **THEN** the skill explains from the findings and the changes between attempts why they did not converge, proposes a recovery and waits for the user

#### Scenario: Execution failure diagnosed
- **WHEN** a supervised run stops with an execution failure of a worker
- **THEN** the skill reads that worker's transcript, names the likely cause and any evidence the transcript does not hold, proposes a recovery and waits for the user without changing anything
