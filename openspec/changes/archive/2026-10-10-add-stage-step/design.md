# Design

## Context

See proposal.md for motivation and issue #43 for acceptance. `src/state.ts` defines five stages in order: proposal-review, implementation, integration, archive and delivery. `commands.ts` already separates preparation, enrollment and loading an existing run; `controller.ts::advance` owns stage dispatch, handoffs, reporting, signals and lock release. Stage functions return success, a halt or `REPLAN`; proposal review and implementation contain their own bounded cycles. Existing tests use `test/helpers.ts` to script role replies, checks and subprocess interruptions.

The contract currently names only four commands and unconditionally starts implementation after proposal approval. The delta must preserve ordinary automatic advancement while making its boundary conditional on the requested command; enrollment, configuration and OpenSpec prerequisite clauses also need to name `step`.

## Goals / Non-Goals

**Goals:** Add a limit to one controller invocation, sharing stage execution and all persisted recovery data with ordinary advancement; derive successful boundary status from existing state.

**Non-Goals:** A second executor, a durable execution mode, selecting a stage or role, replaying completed stages, extra command flags, new manual-edit checks or a benchmarking subsystem.

## Decisions

### One command, existing preparation and lock

Add `step(change)` to `commands.ts` and CLI dispatch/usage. Its syntax is exactly `loop step <change>`; `--attempts` and `--implement` remain resume-only. Prepare from the invoking checkout as today, create the run directory if needed, acquire its existing lock, then load an existing state or enroll a new change under that lock. Share the existing helpers rather than repeating their checks. Preserve `run`'s existing refusal when state already exists; use `resume` for ordinary continuation of a stepped run. A completed run produces the existing completed report without reopening stages.

A separate `step` enrollment or weaker preparation would bypass the committed-proposal, clean-worktree, configured-role, required-check-list, OpenSpec-version and delivery-upstream refusals. No additional preparation checks are needed.

### Return after the first successful stage completion

Give `advance` an invocation-only single-stage limit, defaulting to today's unlimited progression. In the existing success branch, persist the completed stage and clear `current`, print the normal stage-complete progress line, then return the boundary report if a pending stage remains. If none remains, print the existing completed report. The limit is checked only after success, not after worker turns or review attempts. The existing `finally` releases the lock and removes signal handlers.

Follow `REPLAN` as today until the first subsequent successful stage completion or a halt. For example, an implementation plan problem can revise and approve the plan, then return with implementation next; integration can hand findings to implementation, then return with integration next after implementation succeeds. Do not insist that the originally selected stage complete in the same invocation. An original-stage target would execute several successful stages and conceal a useful inspection boundary. Returning immediately on `REPLAN` would turn an internal recovery transition into a new stop type. Budgets span these handoffs within the invocation as today; each new `step` invocation gets fresh configured budgets, with no attempt override flag.

### Boundary status without new state

Keep `RunState` unchanged. Once the controller records success, a run with pending stages, `current === null`, `stop === null` and no lock is between stages. In `status`, retain precedence for a live lock, an actual stop, and whole-run completion; distinguish the successful boundary from the existing interrupted case after those checks. A stale lock still means the controller died, even if `current` was already cleared. An active or interrupted run may retain its last worker's `stepGroup`; use the existing lock/takeover rules without clearing or redefining that record.

The report identifies the stage just completed, the next pending stage, `loop step <change>` and `loop resume <change>`, the usual locations and existing cumulative usage totals. Status identifies the boundary and the same next stage/commands. A successful boundary exits 0, a halt exits 1, and a refusal exits 2; final delivery and calls on already completed runs use the ordinary completion report. No pause marker or synthetic stop cause is needed. Adding one would duplicate information already recorded by stage completion and lock release.

### Preserve the supervision contract

Document `step` in README and the shipped `skills/openspec-loop/SKILL.md`, including its exit statuses and recovery examples. Forward its progress and report using the existing monitoring instructions. A successful boundary calls for inspection and explicit continuation, without diagnosing a failure or automatically launching another advancement. The same agreement requirement applies to continuing a halted run with `step` as with `resume`.

## Risks / Trade-offs

- [A stage can invoke several roles or return through a handoff] → Define the boundary as the first successful stage completion, and test both implementation-to-plan and integration-to-implementation handoffs; this command is not a single worker invocation.
- [A boundary is mistaken for an interruption or whole-run completion] → Test report text, next-stage selection, stage state, released lock and status after each boundary; preserve stale-lock interrupted reporting.
- [New command bypasses existing refusals or repeats work] → Exercise both enrollment paths, existing-state continuation, changed prerequisites, lock refusal and ordinary resume through the shared fixtures.

## Migration Plan

No state or configuration migration. Existing run files remain readable, and prior stopped/interrupted runs can be continued with `step`. Existing run/resume commands retain unlimited progression. Rolling back removes the command while existing stepped runs remain resumable by the old controller.

## Cut List

Clause names below refer to the contract as amended by this delta. Each kept item uses the existing implementation wherever available.

- Removed: the second statement of step's boundary limit in Run control; Stage-bounded advancement already defines it.
- Removed: duplicated command preparation and lock handling; run, resume and step share one command entry helper and the existing controller.
- Removed: an exact transcript sequence-number assertion; increasing sequence numbers and preserved transcripts verify continuation without depending on the number of internal checks.
- Rejected: a persisted step mode or pause field; existing stages/current/stop/lock represent the boundary, so a second record duplicates them.
- Rejected: an original-stage target, individual-role execution, arbitrary replay, new flags and benchmarking infrastructure; issue #43 limits this change to stage boundaries.
- Kept: `step` CLI entry (Stage-bounded advancement). Simpler: only run/resume; neither returns at a successful boundary.
- Kept: shared command entry helper (Controller ownership; Explicit enrollment). Simpler: prepare and lock step separately; the new command could bypass the existing enrollment or takeover refusals.
- Kept: invocation-only controller limit (Stage-bounded advancement). Simpler: no limit; the next stage starts before inspection.
- Kept: success-only limit check (Stage-bounded advancement). Simpler: return after a worker or handoff; an incomplete review cycle would be presented as a successful stage.
- Kept: existing stage order and first-pending selection (Run control). Simpler: always start at proposal review; completed work repeats.
- Kept: shared enrollment (Explicit enrollment; Integration and delivery). Simpler: create step state independently; enrollment behavior and branch/worktree ownership can differ.
- Kept: committed-proposal check (Explicit enrollment). Simpler: accept any proposal file; uncommitted work enrolls.
- Kept: initial non-default worktree cleanliness check (Explicit enrollment). Simpler: omit it; unrelated uncommitted work enters the run.
- Kept: configuration and required-check-list validation (Loop configuration; Implementation cycle). Simpler: bypass preparation; a malformed or missing check list advances.
- Kept: configured role resolution (Independent roles). Simpler: defer resolution; an unavailable role fails after work already advances.
- Kept: OpenSpec version check (OpenSpec CLI). Simpler: omit it for step; an unsupported CLI can start a run.
- Kept: upstream prerequisite check (Delivery remote). Simpler: defer it until delivery; step enrolls a run ordinary advancement refuses.
- Kept: shared lock and existing takeover check (Controller ownership; Run control). Simpler: rely on status before starting; concurrent callers race and surviving worker groups are missed.
- Kept: existing fresh configured budgets (Bounded attempts and execution failures). Simpler: one worker turn or unlimited retries; the first truncates stage cycles and the second loses bounds.
- Kept: existing handoffs (Autonomous plan revision; Integration and delivery). Simpler: stop on every handoff; existing autonomous recovery becomes a new user intervention.
- Kept: existing halt/signal handling and lock release (Run control). Simpler: a separate step exit path; stops or cleanup can differ from ordinary advancement.
- Kept: boundary report (Stage-bounded advancement). Simpler: reuse the completed report; an incomplete run is reported complete.
- Kept: next-stage and continuation text (Stage-bounded advancement). Simpler: report only success; the caller cannot identify what can run next.
- Kept: shared continuation formatter (Stage-bounded advancement). Simpler: independent report and status messages; the two interfaces can identify different continuation commands or stages after a handoff.
- Kept: status boundary classification with lock precedence (Stage-bounded advancement; Run control). Simpler: classify every unlocked pending run as interrupted, or ignore stale locks; successful boundaries or controller deaths are misreported.
- Kept: existing exit codes (Stage-bounded advancement). Simpler: report all returns as success; actual stops and refusals lose their command outcome.
- Kept: existing `change` field (Explicit enrollment). Simpler: no change identity in shared state; the resumed run cannot reliably name its owned change.
- Kept: existing `branch` field (Integration and delivery). Simpler: infer the invoking branch; continuation from another checkout can target another branch.
- Kept: existing `worktree` field (Loop configuration). Simpler: recompute it; a configuration change moves continuation away from the enrolled worktree.
- Kept: existing `stages` field (Run control). Simpler: retain only a current stage; completed work and reopened prerequisites cannot both be represented.
- Kept: existing `current` field (Run control). Simpler: infer activity from pending stages; interruption within a stage cannot be distinguished from a successful boundary.
- Kept: existing `stop` field (Run control). Simpler: treat every inactive run alike; cause and recovery disappear.
- Kept: existing `owedReview` record reference (Autonomous plan revision). Simpler: forget an interrupted revision's findings; recovery loses the work still owed.
- Kept: existing `owedFindings` record reference (Implementation cycle). Simpler: resume without findings; the implementer loses checks/review feedback.
- Kept: existing `approvedPatch` field (Reviews and verdicts; Integration and delivery). Simpler: assume approval survives integration; a changed patch escapes review.
- Kept: existing `stepGroup` field (Run control). Simpler: check only the controller PID; a surviving worker can run beside takeover.
- Kept: existing transcripts and verdict/finding records (Reviews and verdicts; Progress and usage reporting). Simpler: overwrite them at each step; recovery and diagnosis lose earlier evidence.
- Kept: existing usage records and totals in the boundary report (Progress and usage reporting). Simpler: show only this invocation's usage; earlier attempts disappear from the reported run cost.
- Kept: README command/example edits (issue #43's supported-command request). Simpler: leave the four-command reference; callers cannot discover or use the stage boundary.
- Kept: supervision skill edits (Supervision skill). Simpler: retain completion/stop-only guidance; the session may diagnose success as a failure or continue without inspection.
- Kept: task 1.1 (Stage-bounded advancement; Explicit enrollment). Simpler: CLI dispatch alone; there is no bounded shared advancement to invoke.
- Kept: task 1.2 (Explicit enrollment; Controller ownership; advancement prerequisites). Simpler: happy-path testing alone; a command bypass of existing refusals is unverified. Reuse existing cases rather than adding a second validation mechanism.
- Kept: task 1.3 (issue #43's supported-command request). Simpler: command table alone; ordinary continuation and exit-status meaning remain unclear.
- Kept: task 2.1 (Stage-bounded advancement). Simpler: test only proposal review; later-stage boundaries, status and final completion are unverified.
- Kept: task 2.2 (Run control; Reviews and verdicts; Progress and usage reporting). Simpler: one approving worker fixture; stage cycles, accumulated reports and ordinary continuation are unverified.
- Kept: task 2.3 (Supervision skill; issue #43's inspection use). Simpler: document only the syntax; supervision still lacks successful-boundary behavior.
- Kept: task 3.1 (Autonomous plan revision; Integration and delivery). Simpler: test only forward progression; handoffs may cross the promised boundary or become new stops.
- Kept: task 3.2 (Run control; Bounded attempts and execution failures). Simpler: test success only; failure and interrupted-run semantics under step remain unverified.
- Kept: task 4.1 (repository-required npm test and cut pass; OpenSpec artifact validation). Simpler: run only new tests; regressions across ordinary advancement and invalid deltas are unverified.
