# Spec Delta

## ADDED Requirements

### Requirement: Proposing skill

The loop SHALL ship a `loop-propose` skill for Claude Code and Codex that delegates artifact creation to the project's installed native OpenSpec proposing workflow with the same request, working directory and selected store. On completion it SHALL summarize the proposed design and concrete changes from the completed artifacts before presenting the artifact inventory and readiness handoff.

#### Scenario: Native proposal with a design summary
- **WHEN** the user invokes `loop-propose` in a project with native OpenSpec proposing installed
- **THEN** it follows that installed workflow to create the planning artifacts and presents their proposed design and changes before the artifact inventory and readiness handoff

## MODIFIED Requirements

### Requirement: Supervision skill

The loop SHALL ship a `loop-run` skill for Claude and Codex that supervises a run through the loop's commands, including `step`. The skill SHALL start the run and forward each progress line to the user as it arrives. When the run completes, stops or returns control between stages, the skill SHALL show the user its report unchanged. When the run stops, the skill SHALL diagnose the stop with the user from the report, the transcripts, the failing agent's configured command, the review and check findings and the changes between attempts: the likely cause, the evidence that is missing, why attempts did not converge when they ran out, and a recovery. For an execution failure, the skill SHALL identify the specific failed operation and the evidence establishing it before proposing recovery; the stage, agent alias and exit status alone SHALL NOT constitute a causal diagnosis. When needed to distinguish a harness failure from an adapter's reply rejection, the skill SHALL inspect the invoked adapter and its relevant helper through targeted reads. For an execution failure, the diagnosis SHALL distinguish committed from uncommitted work and completed from pending validation using the available run records and Git evidence. When the evidence cannot establish a cause or part of that work state, the skill SHALL state that uncertainty rather than infer it from the exit status. The skill SHALL change nothing while diagnosing. A successful stage boundary SHALL be presented for inspection without failure diagnosis or automatic continuation, and a stop the user requested SHALL stay stopped.

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

### Requirement: Scoping skill

The loop SHALL ship a `loop-scope` skill for Claude Code and Codex. It SHALL rank open issues following repository instructions, explain the order, await the user's selection, and propose selected issues through `loop-propose` in the session worktree. Before separately committing each finished proposal, it SHALL record its source issue, resolve required decisions or record explicit design defaults, and trim scope, filing omitted requested work as linked follow-up issues and non-goals.

#### Scenario: Issue choice stays attended
- **WHEN** the user invokes the scoping skill
- **THEN** it reads repository instructions, lists and ranks open issues with its reasoning, and waits for the user to choose before drafting a proposal

#### Scenario: Decision sweep and individual commit
- **WHEN** a selected issue's native proposal artifacts are ready
- **THEN** the skill reviews scope and required decisions with the user, records decisions and explicit defaults in the design and the source issue in the proposal, files and links any trimmed requested work, and commits only that proposal's artifacts before moving to another issue

#### Scenario: Native proposing uses the session root
- **WHEN** the skill invokes native proposing and commits its artifacts
- **THEN** it explicitly uses the reported session worktree as the working directory, verifies the resolved artifact paths are there, and runs Git-writing scope commands and proposal commits with the permissions they require rather than falling back to authoring in the default checkout

#### Scenario: Follow-up for work outside the proposal
- **WHEN** requested work is trimmed from a proposal whose branch has not been published or whose delivery mode is local
- **THEN** the follow-up issue links the source issue and names the OpenSpec change, and the proposal's non-goals link the follow-up issue without requiring a URL for an unpublished proposal

#### Scenario: Session finish remains a proposal operation
- **WHEN** the user chooses to finish scoping
- **THEN** the skill invokes the deterministic finish command, reports its outcome and any recovery, leaves source issues open, and tells the user to enroll a proposal from the default branch after landing it there, not from the multi-proposal session branch

### Requirement: Project skill setup

The loop SHALL provide `loop setup`, accepting no arguments or options, to install every bundled skill into `.agents/skills/` and `.claude/skills/` in the invoking Git checkout's root. The executing package SHALL supply the skill contents independently of the current directory, PATH and npm's global prefix. Success SHALL print each installed destination and exit 0.

#### Scenario: Initial installation
- **WHEN** `loop setup` runs in an OpenSpec-initialized Git checkout with no bundled skill copies
- **THEN** both tool directories contain every skill from the executing package, including `loop-propose`, `loop-proposals`, `loop-run` and `loop-scope`, with the packaged contents
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

Rerunning `loop setup` SHALL replace existing bundled skill directories with the executing package's copies and add missing bundled skills. Replacement SHALL remove obsolete contents within those package-owned directories and overwrite local edits there. Setup SHALL preserve unrelated skill directories, native OpenSpec skills and files outside the current and retired bundled skill destinations. Setup SHALL remove the retired package-owned `openspec-loop`, `openspec-scope` and `openspec-proposals` skill directories after installing their replacements. Repeated setup with the same package SHALL leave the same file contents.

#### Scenario: Upgrade replaces retired skill directories
- **WHEN** a project has an `openspec-loop`, `openspec-scope` or `openspec-proposals` skill directory and setup runs from the new package
- **THEN** both tool directories receive `loop-propose`, `loop-proposals`, `loop-run` and `loop-scope`, and the retired directories are removed
- **AND** unrelated skills and native OpenSpec instructions remain unchanged

#### Scenario: Obsolete bundled files removed
- **WHEN** a bundled skill's project copy contains an obsolete file or local edit
- **THEN** setup replaces that skill directory with the packaged contents, removing the obsolete file and overwriting the edit

#### Scenario: Setup repeated
- **WHEN** setup is rerun after successful installation with the same package
- **THEN** the installed file contents remain identical and the command succeeds

### Requirement: Setup boundaries and failures

Setup SHALL require a Git working tree, without loading loop configuration, requiring an OpenSpec root or resolving workers. It SHALL refuse with exit 2 before writing when the project is unsuitable or a path needed for a current or retired bundled skill directory is a file or symlink, naming the problem. A source or copy failure SHALL exit 1 and name the failing path. Setup SHALL change no configuration, Git refs, index, run state or user-level skill directories, and SHALL enroll no run.

#### Scenario: Project setup not yet complete
- **WHEN** setup runs in a Git checkout without an OpenSpec root, `openspec/loop.yaml` or configured worker executables
- **THEN** it installs the skills without requiring run preparation or creating OpenSpec or loop configuration

#### Scenario: Unsuitable project
- **WHEN** setup runs outside a Git working tree
- **THEN** it refuses with exit 2, identifies the missing prerequisite and creates no files

#### Scenario: Obstructed destination
- **WHEN** a path needed for a tool's skill directory or a current or retired bundled skill directory is occupied by a file or symlink
- **THEN** setup refuses before changing any destination and names the obstructing path
- **AND** it leaves the object and any symlink target untouched

#### Scenario: Installation fails
- **WHEN** a bundled source cannot be read or a destination cannot be written
- **THEN** setup exits 1, identifies the failing path and does not report successful completion
- **AND** a later explicit setup invocation can refresh all destinations after the cause is corrected

#### Scenario: Project configuration preserved
- **WHEN** setup succeeds in a configured project
- **THEN** loop configuration, OpenSpec configuration, ignore files, Git refs, the index and existing run state remain unchanged
- **AND** only the invoking checkout's current and retired bundled skill destinations are changed

### Requirement: Proposal listing skill

The loop SHALL ship a read-only `loop-proposals` skill for Claude Code and Codex. It SHALL list every active change in the invoking checkout's resolved OpenSpec root or explicitly selected store, showing its name, date, summary and recorded source issue. It SHALL group bugs first and remaining proposals by repository area, using source issue metadata where available and marking inferred classifications. It SHALL recommend an order with reasons based on proposal dependencies, correctness and scope.

#### Scenario: Overview after batch scoping
- **WHEN** the selected root contains several proposals created through `loop-scope`
- **THEN** the skill shows one row per change under counted groups, bugs first and other proposals by area, with change names, dates, summaries and their source issues
- **AND** it recommends which proposals to take first and explains the order from their plans

#### Scenario: Drafts and proposals without source issues
- **WHEN** the active changes include a draft without a proposal file or a proposal without a source issue
- **THEN** each remains in the listing by change name, missing information is identified, and any classification inferred from available artifacts is marked
