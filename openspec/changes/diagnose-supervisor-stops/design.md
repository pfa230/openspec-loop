# Design

## Context

See `proposal.md` for the incident and replacement behavior. [verified] The existing `skills/openspec-loop/SKILL.md` already requires unchanged report relay, error evidence and read-only diagnosis, but its execution-failure guidance can end at a malformed-reply description. Its permitted reads do not explicitly include the invoked adapter/helper or `git status` for uncommitted work. The README's supervision paragraph reflects that guidance.

[verified] At this proposal's base, `src/adapters/common.ts` returns from `runHarness()` only after the child exits successfully. `src/adapters/opencode.ts` then parses the entire final text; preceding prose makes parsing fail before `writeReply()`. The controller observes the wrapper's status, not that causal chain. `test/adapters.test.ts` has a stub harness and rejection tests, but those establish adapter behavior rather than a supervising session's explanation. The archived `validate-complete-workflow` change exercised diagnosis in disposable repositories with both Claude and Codex; reuse that approach rather than adding a supervisor runtime.

## Goals / Non-Goals

**Goals:** Make the existing execution-failure diagnosis lead to an evidence-backed explanation of the failed operation and remaining work before asking about recovery. Verify the explanation with the historical successful-child/rejected-reply case.

**Non-Goals:** Adapter or controller repairs; extracting embedded JSON; new reports, configuration, state or automated diagnosis; broad environment inspection; executing the failing command during diagnosis; integration with #54's repair.

## Decisions

### Amend the existing diagnosis sequence

Keep report relay unchanged. In the skill's Rules and Diagnosing a stop sections, distinguish relaying the observed stop from explaining its cause. After reading the transcript and effective command, trace the specific failed operation before recovery. Add a short successful-child/rejected-reply example that follows the actual parse failure; do not treat a wrapper's nonzero exit as proof its child failed. Update the README's existing supervision paragraph to describe this behavior.

Default: reuse the existing numbered sequence and presentation; no new mandatory report template or diagnosis file. Merely adding a warning about exit codes leaves the incident's required causal investigation unspecified.

### Allow only the additional reads needed for this case

Permit locating the configured executable with `command -v` or `readlink`, and reading that invoked adapter plus a directly relevant helper with filesystem reads. Relative commands remain relative to the invoking checkout, as the existing configuration guidance states. Inspect only the execution and reply-handling path needed to explain the observed error. Installed adapter code can differ from this repository's source: identify the inspected path, and state uncertainty if the evidence cannot establish that it represents the failing invocation. Do not install, rebuild, run the adapter, invoke its harness or search unrelated configuration to test the theory.

Permit `git status --short` and reads of the run's existing records alongside the already permitted `git log` and `git diff`. Use these to describe work left in the reported worktree, commits made and which loop stages completed. Separate checks recorded inside the worker transcript from the loop's own check/review records. Missing evidence is reported as unknown rather than guessed from a missing reply or an exit code.

Default: no resolver helper or new state fields. Transcript-only diagnosis cannot always distinguish a wrapper rejection from a harness crash; Git history alone cannot show uncommitted edits.

### Keep one reusable supervision regression, independent of adapter fixes

Add `test/recordings/supervisor-reply-rejection.md` as a compact fixture recipe and acceptance record. Reuse the disposable-repository and stub-reviewer setup in `test/helpers.ts` to generate a real loop stop without hand-authoring run state. Configure a minimal fixture wrapper for the implementer with the observed historical behavior. Its stub child makes a small implementation edit, runs a local fixture check, then exits 0 after emitting cut-pass prose followed by `{"planProblem":null}`. The wrapper must reject the complete final text, exit 1 and write no reply. Preserve readable fixture-wrapper code so the supervisor can trace that outcome. This keeps the case reproducible after #54 changes the shipped adapter; do not change the current adapter to preserve an old failure.

The prepared stopped run must contain uncommitted implementation edits, transcript evidence of worker-run checks, pending loop check/review stages, the effective configured wrapper command and the unchanged stop report. Capture Git status/history and run files before diagnosis. In fresh Claude and Codex sessions using the shipped skill, ask only for diagnosis without recovery authorization. Require their first explanation to:

- Relay the report unchanged and explain its observed status separately.
- Identify the successful child, full-text parse rejection and absent reply using the transcript and wrapper/helper reads.
- Explain surviving uncommitted edits, recorded worker checks and pending loop checks/review.
- State that why the model produced the malformed reply remains unknown.
- Propose recovery only after that explanation and wait for agreement.

Compare the run files, worktree and Git history before/after to establish read-only behavior. Record the two sessions' relevant reads and explanations against these criteria. Stage/alias/status alone, or merely naming prose before JSON, fails the scenario. A checklist or string assertion over the skill does not establish supervisor behavior. If a harness is unavailable, record the specific limitation and leave its rehearsal task incomplete.

Default: use one documented fixture recipe and the existing manual rehearsal approach; no new test runner, evaluator, CLI options or external service. Deterministic adapter tests alone cannot reveal the shallow explanation in #55. The stub does not claim to reproduce the unknown reason a real model ignored its format instruction.

## Risks / Trade-offs

- A skill cannot guarantee every model follows its guidance. The two required rehearsals will validate the requested regression without claiming universal enforcement.
- Installed code or records may be unavailable or have changed since the stop. Explain that limit instead of applying current source behavior to an unverified invocation.
- Guidance could duplicate report fields. Keep the raw report untouched and explain the specific cause and work state separately, using its existing recovery commands.

## Migration Plan

Ship the skill, README clarification and reusable regression record together. Existing project skill copies need the usual refresh described in the README. Rollback restores those files; no run migration or runtime rollback is required.

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
| Existing wait for agreement | Supervision skill: repair/continue only with agreement | Automatic recovery advances a run before the user chooses. |
| Existing read-only diagnosis | Supervision skill: diagnosis changes nothing | Testing a theory modifies the run being investigated. |
| README supervision clarification | #55's supervision behavior in user guidance | The old paragraph omits causal tracing and work-state reporting. |
| One regression recipe record | #55 regression acceptance | An undocumented one-off rehearsal cannot be repeated after adapter changes. |
| Existing disposable-repository/stub-reviewer setup | Supervision skill: work survives a rejected final reply | Hand-authored run state can claim a stop the controller never produced. |
| Frozen fixture wrapper | Supervision skill: successful harness followed by adapter rejection | Using the latest adapter loses the historical boundary when #54 repairs it. |
| Successful stub child with a local check | Supervision skill: successful harness followed by adapter rejection; work survives a rejected final reply | A printed error alone cannot establish child success or recorded worker validation. |
| Fixture worktree edits and pending validation | Supervision skill: work survives a rejected final reply | A transcript-only fixture cannot verify remaining work and loop progress. |
| Claude rehearsal | Supervision skill: shipped skill for Claude | A Codex-only observation does not establish Claude supervision. |
| Codex rehearsal | Supervision skill: shipped skill for Codex | A Claude-only observation does not establish Codex supervision. |
| Before/after fixture evidence | Supervision skill: diagnosis changes nothing | Reading the explanation alone cannot establish preservation of run and Git state. |
| Task 1.1: skill and existing README paragraph | Supervision skill; #55 | A spec-only amendment leaves shipped guidance unchanged. |
| Task 1.2: fixture and both rehearsals | #55 regression acceptance | A static wording check cannot establish actual supervisor behavior. |
| Task 2.1: package/spec checks and cut pass | Repository `npm test` and cut rules; contract is source of truth | A focused prose review misses package regressions or an invalid delta. |
| `.openspec.yaml` record | Explicit native proposal workflow | Handwritten unregistered artifacts omit the native schema metadata. |
| `proposal.md` record | Explicit native proposal workflow | Tasks alone omit scope and the source issue. |
| Spec delta record | Contract is source of truth | Skill-only changes leave the new behavior outside the contract. |
| `design.md` record | Explicit native proposal workflow: regression/inspection decisions | Tasks alone leave the permitted reads and reproducible fixture undecided. |
| `tasks.md` record | Explicit native proposal workflow | Design prose alone has no apply checklist. |

Cut from scope: a new diagnosis engine, structured diagnosis record, runtime gates, adapter parsing changes, broad environment inspection and a new automated supervisor evaluator. Existing skill, report, run records and manual rehearsal already serve the requested behavior. No option or persisted state field is added.
