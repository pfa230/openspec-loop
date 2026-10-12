# Design

## Context

See `proposal.md` for the incident and replacement behavior. [verified] The existing `skills/openspec-loop/SKILL.md` already requires unchanged report relay, error evidence and read-only diagnosis, but its execution-failure guidance can end at a malformed-reply description. Its permitted reads do not explicitly include the invoked adapter/helper or `git status` for uncommitted work. The README's supervision paragraph reflects that guidance.

[verified] At this proposal's base, `src/adapters/common.ts` returns from `runHarness()` only after the child exits successfully. `src/adapters/opencode.ts` then parses the entire final text; preceding prose makes parsing fail before `writeReply()`. The controller observes the wrapper's status, not that causal chain. `test/adapters.test.ts` has a stub harness and rejection tests, but those establish adapter behavior rather than a supervising session's explanation. The archived `validate-complete-workflow` change exercised diagnosis in disposable repositories with both Claude and Codex and kept setup/results on its issue. Reuse that manual rehearsal and evidence convention. The automatic cleanup and private PATH in `test/helpers.ts` require extra lifecycle/environment handling for such a rehearsal; shell setup avoids adding that driver.

## Goals / Non-Goals

**Goals:** Make the existing execution-failure diagnosis lead to an evidence-backed explanation of the failed operation and remaining work before asking about recovery. Verify the explanation with the historical successful-child/rejected-reply case.

**Non-Goals:** Adapter or controller repairs; extracting embedded JSON; new reports, configuration, state or automated diagnosis; broad environment inspection; executing the failing command during diagnosis; integration with #54's repair.

## Decisions

### Amend the existing diagnosis sequence

Keep report relay unchanged. In the skill's Rules and Diagnosing a stop sections, distinguish relaying the observed stop from explaining its cause. After reading the transcript and effective command, trace the specific failed operation before recovery. Add a short successful-child/rejected-reply example that follows the actual parse failure; do not treat a wrapper's nonzero exit as proof its child failed. Update the README's existing supervision paragraph to describe this behavior.

Default: reuse the existing numbered sequence and presentation; no new mandatory report template or diagnosis file. Merely adding a warning about exit codes leaves the incident's required causal investigation unspecified.

### Allow only the additional reads needed for this case

Permit locating the configured executable with `command -v` or `readlink`, and reading that invoked adapter plus a directly relevant helper with filesystem reads. Relative commands remain relative to the invoking checkout, as the existing configuration guidance states. Inspect only the execution and reply-handling path needed to explain the observed error. Installed adapter code can differ from this repository's source: identify the inspected path, and state uncertainty if the evidence cannot establish that it represents the failing invocation. Do not install, rebuild, run the adapter, invoke its harness or search unrelated configuration to test the theory.

Permit `git status --short` and reads of the run's existing records alongside the already permitted `git log` and `git diff`. For execution failures, use these to describe work left in the reported worktree, commits made and which loop stages completed. Separate checks recorded inside the worker transcript from the loop's own check/review records. Missing evidence is reported as unknown rather than guessed from a missing reply or an exit code. Existing exhausted-attempt diagnosis keeps its current reporting obligations.

Default: no resolver helper or new state fields. Transcript-only diagnosis cannot always distinguish a wrapper rejection from a harness crash; Git history alone cannot show uncommitted edits.

### Reproduce the stop with the pinned real adapter

Prepare one disposable repository with explicit shell commands, real OpenSpec and the current implementation branch's built `loop`. Keep its fixture executables, captured output and evidence snapshots in a separate temporary directory outside that repository. Record the setup commands on #55 so they can be repeated; add no repository evidence file or test driver.

1. Export and build this known pre-#54 source commit in the temporary directory: `2322cc7a2f39530be3b68552d8296e580ea11b00`. Use `git archive` and its lockfile's `npm ci`/`npm run build`. Preserve its real `dist/src/adapters/opencode.js` and sibling `common.js`, with the package context needed to run them. This pins the historical parser/helper behavior even after #54 changes the shipped adapter. Do not handwrite another parser or alter the current adapter.
2. Initialize the disposable repository with real OpenSpec, a small committed change and a valid loop configuration. Keep a reviewer script outside the repository that writes `{"findings":[]}` to the reply path supplied by the worker interface; use it for both review roles. Configure the implementer as `node` plus the absolute path of the pinned adapter, so its script and helper remain directly inspectable from any checkout. Put the branch's built `loop` on a temporary PATH with a symlink; do not change the global installation.
3. Put only a stub `opencode` child on that same temporary PATH. It makes a small edit to an already tracked `implementation.js`, runs `node --check implementation.js` successfully, records that actual check/result in the JSON event stream, emits a final `text` event containing cut-pass prose followed by `{"planProblem":null}`, and exits 0. Set the loop's non-empty `checks` list to that same check command. The fixture deliberately injects the malformed reply; it does not reproduce a real model's unknown reason for ignoring instructions.
4. Export the same PATH when starting the loop and both supervisor sessions. From a terminal, run the current branch's `loop run <fixture-change>` with stdout and stderr redirected to a log outside the fixture repository. Verify the real controller stops after the pinned adapter's parse rejection, before implementation commit, loop checks or implementation review. Preserve the full log for unchanged report relay: the controller prints its stop report but does not persist that full text in run state.

Before diagnosis, verify child exit 0 from the adapter/helper path and recorded child check, wrapper exit 1, no reply file, surviving uncommitted edits, and the absence of loop check/review records for the failed attempt. Do not hand-author run state or fake a report. Keep the fixture until both diagnoses and preservation comparisons finish; cleanup is ordinary manual removal afterwards.

Default: absolute fixture script paths and one explicitly inherited PATH replace the test helper's lifecycle/environment plumbing. Taking whichever adapter is currently installed loses the original failure after #54; copying a real pinned adapter pair retains its two-layer execution path without adding adapter logic.

### Capture both diagnoses and publish one evidence comment

Use fresh Claude and Codex sessions with the current branch's supervision skill. Each prompt names the original invocation checkout, saved loop log, reported worktree and run directory, and asks only for diagnosis without permission to repair or resume. Include the historical #55 context so the deliberately injected fixture reply is distinguished from the original incident's unexplained model behavior.

Capture tool calls and explanations with native CLI event output: Claude `-p --permission-mode plan --output-format stream-json --verbose`, and Codex `exec --json -s read-only`. Explicitly instruct each session to read and follow the current `skills/openspec-loop/SKILL.md`; record actual invocation arguments, versions and models. Store these JSONL captures outside the fixture repository and run directory. A final text answer alone cannot establish which evidence the session inspected.

Require each first explanation to relay the saved report unchanged, trace successful child to full-text parsing failure and missing reply using the invoked adapter/helper, describe surviving uncommitted work and worker-run versus pending loop validation, and propose recovery only after that explanation. It must identify what the evidence leaves unknown, without confusing the stub's intentional injection with an established reason for the original model's reply. Stage/alias/status alone, or merely naming prose before JSON, fails the scenario.

Before and after each diagnosis, compare Git HEAD/history, `git status --porcelain` and `git diff HEAD`, plus file lists and checksums for the reported run directory and the worktree's tracked/untracked files. This detects changed content even when a file remains uncommitted. Exclude raw `.git` metadata such as index bytes, which a read-only `git status` may refresh, and keep session captures outside the compared paths. Require no edits, new commits, loop continuation or changes to run files. If a harness is unavailable or cannot provide the needed reads, record the specific limitation and leave task 1.2 incomplete rather than substitute a wording check.

Publish one evidence comment on #55 following #9's setup/result format: exact setup commands and configuration, pinned adapter commit, loop-under-test commit, supervisor versions/models/arguments, unchanged stop report and status, relevant tool calls and causal explanations from both sessions, before/after comparisons, and a pass/fail/unsupported result for each acceptance criterion. No evidence comment is posted during this planning revision; publishing belongs to the implementation rehearsal task.

Default: native JSONL captures and the existing issue-comment convention suffice; no tmux requirement, evaluator, maintained fixture document or new runtime record is needed. Deterministic adapter tests alone cannot reveal the shallow explanation in #55.

## Risks / Trade-offs

- A skill cannot guarantee every model follows its guidance. The two required rehearsals will validate the requested regression without claiming universal enforcement.
- Installed code or records may be unavailable or have changed since the stop. Explain that limit instead of applying current source behavior to an unverified invocation.
- Guidance could duplicate report fields. Keep the raw report untouched and explain the specific cause and work state separately, using its existing recovery commands.

## Migration Plan

Ship the skill and README clarification together, with the rehearsal evidence on #55. Existing project skill copies need the usual refresh described in the README. Rollback restores those two files; no run migration or runtime rollback is required.

## Cut Pass

Each item below serves the amended Supervision skill requirement or the explicit proposal workflow; implementation must repeat this audit after its last edit.

| Kept item | Authority | Simpler version and its concrete failure |
| --- | --- | --- |
| Existing unchanged report relay | Supervision skill: report shown unchanged | A summary loses report evidence and breaks the existing obligation. |
| Causal explanation before recovery | Supervision skill: execution failure diagnosed | Stage/alias/status alone repeats the shallow diagnosis in #55. |
| Successful-child/rejected-reply distinction | Supervision skill: successful harness followed by adapter rejection | Calling the worker exit a harness crash misidentifies the failing operation. |
| Targeted invoked-wrapper/helper reads | Supervision skill: successful harness followed by adapter rejection | Transcript-only reads need not establish which process supplied the exit. |
| Executable-location reads | Supervision skill: targeted invoked-adapter inspection | Reading this repository's adapter may describe a different installed executable. |
| Git status alongside existing log/diff reads | Supervision skill: work survives a rejected final reply | Commit history alone hides surviving uncommitted edits. |
| Existing run-record reads | Supervision skill: completed versus pending validation | Worker test output alone cannot establish loop checks/review completion. |
| Explicit remaining uncertainty | Supervision skill: evidence does not establish the underlying cause | Guessing why the model ignored its instruction invents a cause. |
| Strict reply-contract recovery reminder | Existing Worker interface and Shipped adapters; #55's separation from #54 | Without the reminder, the initial Claude rehearsal suggested weakening validation as run recovery. |
| Existing wait for agreement | Supervision skill: repair/continue only with agreement | Automatic recovery advances a run before the user chooses. |
| Existing read-only diagnosis | Supervision skill: diagnosis changes nothing | Testing a theory modifies the run being investigated. |
| README supervision clarification | #55's supervision behavior in user guidance | The old paragraph omits causal tracing and work-state reporting. |
| Disposable shell setup with real OpenSpec and branch build | #55 regression acceptance | Hand-authored run state can claim a stop the controller never produced. |
| Absolute configured adapter/reviewer paths | Supervision skill: targeted invoked-adapter inspection | A test-only PATH invisible to the supervisor prevents inspection of the actual scripts. |
| One inherited temporary PATH | Supervision skill: successful harness followed by adapter rejection | A different child lookup can run the real provider or fail before the intended parser boundary. |
| Pinned real adapter | Supervision skill: successful harness followed by adapter rejection | Using the latest adapter loses the historical boundary when #54 repairs it. |
| Pinned real shared helper | Supervision skill: successful harness followed by adapter rejection | A copied single-file parser skips the child-exit handling of the actual incident. |
| Successful stub child with a local check | Supervision skill: successful harness followed by adapter rejection; work survives a rejected final reply | A printed error alone cannot establish child success or recorded worker validation. |
| Non-empty loop check matching the child check | Supervision skill: work survives a rejected final reply | `checks: []` leaves no pending loop check to distinguish from worker validation. |
| Fixture worktree edits and pending validation | Supervision skill: work survives a rejected final reply | A transcript-only fixture cannot verify remaining work and loop progress. |
| Captured loop stdout/stderr log | Supervision skill: report shown unchanged | Run state alone does not contain the full report to relay. |
| Claude rehearsal | Supervision skill: shipped skill for Claude | A Codex-only observation does not establish Claude supervision. |
| Codex rehearsal | Supervision skill: shipped skill for Codex | A Claude-only observation does not establish Codex supervision. |
| Native session JSONL captures | #55 regression acceptance: investigation with evidence | A plain final answer cannot show which files the supervisor inspected. |
| Claude diagnosis-only system instruction | Supervision skill: diagnosis changes nothing; #55 regression acceptance | Default CLI plan authoring attempted an unrelated scratch-plan write; the instruction lets the rehearsal test diagnosis alone. |
| Before/after Git status/history/diff | Supervision skill: diagnosis changes nothing | Reading the explanation alone cannot establish preservation of Git state. |
| Before/after run/worktree file lists and checksums | Supervision skill: diagnosis changes nothing | Git status alone misses changed contents of an already modified or untracked file. |
| One issue evidence comment with reproducible setup/results | #55 regression acceptance; existing #9 evidence convention | Unrecorded temporary captures cannot support or repeat the acceptance result. |
| Task 1.1: skill and existing README paragraph | Supervision skill; #55 | A spec-only amendment leaves shipped guidance unchanged. |
| Task 1.2: fixture and both rehearsals | #55 regression acceptance | A static wording check cannot establish actual supervisor behavior. |
| Task 2.1: package/spec checks and cut pass | Repository `npm test` and cut rules; contract is source of truth | A focused prose review misses package regressions or an invalid delta. |
| `.openspec.yaml` record | Explicit native proposal workflow | Handwritten unregistered artifacts omit the native schema metadata. |
| `proposal.md` record | Explicit native proposal workflow | Tasks alone omit scope and the source issue. |
| Spec delta record | Contract is source of truth | Skill-only changes leave the new behavior outside the contract. |
| `design.md` record | Explicit native proposal workflow: regression/inspection decisions | Tasks alone leave the permitted reads and reproducible fixture undecided. |
| `tasks.md` record | Explicit native proposal workflow | Design prose alone has no apply checklist. |

Removed during revision: the `test/recordings/` recipe/evidence file, `test/helpers.ts` reuse and its extra driver/lifecycle plumbing, the handwritten parser wrapper, the implied full report in run state, and the reporting duty beyond execution failures. Use the pinned real adapter/helper, explicit shell setup, captured stdout and one issue comment instead. Also keep new diagnosis engines, structured runtime records, gates, adapter parsing changes, broad environment inspection, a tmux requirement and an automated evaluator out of scope: existing guidance, records and native captures serve the requested behavior. No option or persisted state field is added.

Implementation cut pass: all retained items above still serve the named clauses. Reused the existing Rules, execution-failure and presentation sections and the existing README paragraph; added no runtime code, settings or state. The successful-child parsing example and strict-reply recovery reminder address the observed incident and rehearsal advice. The CLI diagnosis-only instruction is confined to the temporary rehearsal, not shipped as product configuration. Removed the initial loose-validation recovery suggestion from the accepted outcome and used final sessions that performed only reads. Reproducible setup, earlier observations, final diagnoses and preservation comparisons are recorded in the [#55 evidence comment](https://github.com/pfa230/openspec-loop/issues/55#issuecomment-6128688896); no transcript or evidence file is committed here.
