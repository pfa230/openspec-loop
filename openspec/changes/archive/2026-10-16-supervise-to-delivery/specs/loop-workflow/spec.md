## MODIFIED Requirements

### Requirement: Controller ownership

After enrollment through `loop run` or `loop step`, one deterministic controller SHALL decide every progression of the run: proposal review and revision, implementation, required checks, implementation review, integration, archival and delivery. Agents SHALL NOT decide progression. At most one advancement of a run SHALL be active at a time, and runs of different changes SHALL NOT share state. The loop's commands SHALL be its only interface: a supervising Claude or Codex session SHALL use the same commands as a person at a terminal, and the loop SHALL NOT depend on any session.

#### Scenario: Concurrent advancement refused
- **WHEN** a second advancement of a run starts while one is active
- **THEN** the controller refuses the second one and the first continues unaffected

#### Scenario: Supervised run
- **WHEN** a Claude or Codex session starts a run and the run stops
- **THEN** the session receives the same progress output and report a terminal would, and can continue the run with the same resume command

### Requirement: Supervision skill

The loop SHALL ship a skill for Claude and Codex that supervises a run through the loop's commands, including `step`. The skill SHALL start the run and forward each progress line to the user as it arrives. When the run completes, stops or returns control between stages, the skill SHALL show the user its report unchanged. When the run stops, the skill SHALL diagnose the stop with the user from the report, the transcripts, the failing agent's configured command, the review and check findings and the changes between attempts: the likely cause, the evidence that is missing, why attempts did not converge when they ran out, and a recovery. For an execution failure, the skill SHALL identify the specific failed operation and the evidence establishing it before proposing recovery; the stage, agent alias and exit status alone SHALL NOT constitute a causal diagnosis. When needed to distinguish a harness failure from an adapter's reply rejection, the skill SHALL inspect the invoked adapter and its relevant helper through targeted reads. For an execution failure, the diagnosis SHALL distinguish committed from uncommitted work and completed from pending validation using the available run records and Git evidence. When the evidence cannot establish a cause or part of that work state, the skill SHALL state that uncertainty rather than infer it from the exit status. The skill SHALL change nothing while diagnosing. A successful stage boundary SHALL be presented for inspection without failure diagnosis or automatic continuation, and a stop the user requested SHALL stay stopped.

After diagnosing any other stop, the skill SHALL state the cause and its recovery, apply the recovery and resume, without waiting for the user. Its recoveries SHALL be edits to the change's plan committed on the run's branch and the loop's resume commands. The skill SHALL hand the stop to the user instead when no such recovery addresses the cause without a decision that neither the user's instructions, the source issue, the plan nor the repository's rules settle, and when the stop repeats a cause the skill already recovered from.

For a decision stop, the skill SHALL answer each question that the user's instructions, the source issue, the plan or the repository's rules settle, and name the source of each answer. When questions remain open, after showing the unchanged report, the skill SHALL present every open question verbatim as a numbered list in user-facing prose outside tool output and the report's code block. For each question it SHALL explain the decision in plain language, give the relevant choices and their practical tradeoff, and recommend an answer with a reason grounded in the plan and review findings; when evidence is insufficient for a recommendation it SHALL identify what is missing. It SHALL ask for a concise reply by question number or approval of all recommendations. References such as "the questions above" or a reminder that only the user can decide SHALL NOT substitute for this handoff. Recommendations SHALL remain proposals until the user answers or explicitly approves them. Once no question is open, the skill SHALL record every answer in the change's design, commit it on the run's branch and resume.

#### Scenario: Progress forwarded
- **WHEN** a supervised run starts a step
- **THEN** the user sees that step's progress line in the session as it is printed

#### Scenario: Report shown unchanged
- **WHEN** a supervised run completes or stops
- **THEN** the user sees the report in the session as the loop printed it

#### Scenario: Attempts did not converge
- **WHEN** a supervised run stops with exhausted implementation attempts
- **THEN** the skill explains from the findings and the changes between attempts why they did not converge, before applying or handing over a recovery

#### Scenario: Plan defect recovered without the user
- **WHEN** a supervised run stops with exhausted proposal-review attempts because the plan leaves open a point the source issue settles
- **THEN** the skill states that cause, edits the plan in the run's worktree, commits it on the run's branch and resumes the run with a fresh attempt budget, without waiting for the user

#### Scenario: Recovery needs the user
- **WHEN** a supervised run stops because a worker's harness reports a quota limit
- **THEN** the skill gives the diagnosis and the action the user must take, and does not resume the run

#### Scenario: Recovery did not hold
- **WHEN** a run the skill resumed stops again for the cause it recovered from
- **THEN** the skill hands the stop to the user with both diagnoses instead of resuming again

#### Scenario: Execution failure diagnosed
- **WHEN** a supervised run stops with an execution failure of a worker
- **THEN** the skill reads that worker's transcript and effective configured command, identifies the failed operation with supporting evidence, and describes the work and validation left behind and any unresolved uncertainty, before applying or handing over a recovery

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

#### Scenario: Decision settled by the source issue
- **WHEN** a supervised run stops with one question whose answer the source issue states
- **THEN** the skill names the issue as the answer's source, records the answer in the change's design, commits it on the run's branch and resumes, without waiting for the user

#### Scenario: Several questions need decisions
- **WHEN** a supervised run stops with two open decision questions in its report
- **THEN** after showing the unchanged report the supervisor quotes both questions verbatim in a numbered list outside the report's code block, explains each decision and its choices and tradeoff, recommends an answer to each with supporting reasons, and invites numbered answers or approval of both recommendations
- **AND** the user can answer from that message without opening tool output, a transcript or another file

#### Scenario: Recommendation is not a decision
- **WHEN** the supervisor has recommended answers and the user has not answered or approved them
- **THEN** the run stays stopped and the supervisor does not record, commit or resume on the strength of its recommendations
- **AND** when available evidence cannot support a recommendation the supervisor states the missing evidence instead of inventing a preference

#### Scenario: User authorizes the complete recovery
- **WHEN** the user approves the presented recommendations and asks the supervisor to record, commit and resume
- **THEN** the supervisor records the approved decisions in the change's design in the run's worktree, commits them on the run's branch and resumes without requesting the same authorization again

#### Scenario: Answers without authorization to continue
- **WHEN** the user answers the open questions but has not authorized recording, committing or resuming
- **THEN** the supervisor records the answers in the change's design in the run's worktree, commits them on the run's branch and resumes, without asking for that authorization

### Requirement: Autonomous plan revision

Once a proposal is committed, revising its plan SHALL need no user. When proposal review returns `REVISE`, or the implementer finds that the approved plan needs a change, the plan reviser SHALL revise the plan in a fresh context and the plan SHALL return to proposal review. The implementer SHALL report a needed plan change instead of making it, and an implementer turn that changes the plan SHALL stop the run as a failure of the implementer; the loop compares the plan before and after each turn, so a turn interrupted before it ends is not checked. The reviser SHALL NOT change a decision recorded in the design. A finding or plan problem that needs a decision the plan does not record SHALL stop the run with the question; the question is answered by recording the decision in the plan on the run's branch and resuming. A reviewer SHALL raise such a decision as a question on its finding, and any finding with a question SHALL stop the run before the plan is revised.

#### Scenario: Plan review requests changes
- **WHEN** the proposal reviewer returns `REVISE`
- **THEN** the plan reviser revises the plan and the plan is reviewed again, without the user

#### Scenario: Plan cannot be implemented as written
- **WHEN** during ordinary advancement the implementer finds that the approved plan needs a change
- **THEN** the plan reviser revises the plan, proposal review runs again, and implementation continues after approval

#### Scenario: Decision needed
- **WHEN** a review finding carries a question for a decision the plan does not record
- **THEN** the run stops with the question without revising the plan, and after the decision is recorded and the run resumes, the plan returns to proposal review
