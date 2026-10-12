## MODIFIED Requirements

### Requirement: Supervision skill

The loop SHALL ship a skill for Claude and Codex that supervises a run through the loop's commands, including `step`. The skill SHALL start the run and forward each progress line to the user as it arrives. When the run completes, stops or returns control between stages, the skill SHALL show the user its report unchanged. When the run stops, the skill SHALL diagnose the stop with the user from the report, the transcripts, the failing agent's configured command, the review and check findings and the changes between attempts: the likely cause, the evidence that is missing, why attempts did not converge when they ran out, and a recovery. For an execution failure, the skill SHALL identify the specific failed operation and the evidence establishing it before proposing recovery; the stage, agent alias and exit status alone SHALL NOT constitute a causal diagnosis. When needed to distinguish a harness failure from an adapter's reply rejection, the skill SHALL inspect the invoked adapter and its relevant helper through targeted reads. For an execution failure, the diagnosis SHALL distinguish committed from uncommitted work and completed from pending validation using the available run records and Git evidence. When the evidence cannot establish a cause or part of that work state, the skill SHALL state that uncertainty rather than infer it from the exit status. The skill SHALL change nothing while diagnosing, and SHALL repair or continue only with the user's agreement. A successful stage boundary SHALL be presented for inspection without failure diagnosis or automatic continuation.

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
- **THEN** the skill reads that worker's transcript and effective configured command, identifies the failed operation with supporting evidence, describes the work and validation left behind and any unresolved uncertainty, proposes a recovery only after that explanation, and waits for the user without changing anything

#### Scenario: Successful harness followed by adapter rejection
- **WHEN** a worker's transcript shows prose followed by JSON and a reply-parsing error, and the invoked wrapper establishes that its successful child returned before the wrapper rejected the final message
- **THEN** the supervisor explains that the child succeeded and the adapter failed while parsing the complete final-message text, cites the transcript and relevant wrapper behavior, and distinguishes that failure from a child-process crash before proposing recovery
- **AND** copying the report with only its stage, agent alias and exit status does not satisfy the diagnosis

#### Scenario: Work survives a rejected final reply
- **WHEN** a reply rejection leaves implementation edits uncommitted, the transcript records worker-run checks, and the loop has not completed its own required checks or review for that attempt
- **THEN** the supervisor reports that the edits remain in the worktree, identifies their uncommitted status and the distinction between recorded worker checks and pending loop validation, and does not describe the work as lost or fully reviewed

#### Scenario: Evidence does not establish the underlying cause
- **WHEN** the available evidence establishes malformed reply rejection but does not establish why the model produced that reply, or the invoked adapter cannot be inspected sufficiently to establish its child outcome
- **THEN** the supervisor states the specific limit, does not invent a model, authentication, quota, network or compiler cause, and does not rerun or modify the failed run to test a theory
