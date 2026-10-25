# Design

## Context

See [proposal.md](proposal.md) for the integration request and scope. `src/commands.ts:status` already reads saved state and the lock holder, classifies five outcomes, and prints the status report. `src/cli.ts` currently accepts no status options. `test/control.test.ts` and `test/stepping.test.ts` already exercise these outcomes; `test/implementation.test.ts` exercises decision stops. The operations guide already explains direct CLI use and recovery.

## Goals / Non-Goals

**Goal:** expose the existing observation through the [JSON run status contract](specs/loop-workflow/spec.md) without creating a second state model.

**Non-goal:** make report prose machine-readable or expose internal run files as a public API.

## Decisions

### One output option

Accept `--json` once after the change name on `status`, and add it to CLI usage. Other commands retain their current syntax. In `status`, assign a machine status alongside the existing summary in the same conditional branches, construct the ordinary report once, and choose text or JSON output. Keep the existing classification order:

| Existing observation, in precedence order | JSON status |
|---|---|
| Live lock holder | `advancing` |
| Recorded stop with no lock holder | `stopped` |
| Every stage complete | `complete` |
| No lock holder, current stage, or stop | `between-stages` |
| Any remaining observation | `interrupted` |

Read state and the lock once per query, as today; do not invoke text status as a subprocess or parse its output. No controller changes or persisted fields are needed. An event stream would require a second observation interface when a snapshot suffices for the agreed host flow.

### Rendering

Use the five fields defined in the spec. `report` includes the ordinary status text's trailing newline; it is display/agent context, and its wording is not a machine contract.

Serialize this object with `JSON.stringify` and append a newline. Do not catch refusals to synthesize JSON errors; the existing CLI handler retains exit 2, stderr diagnostics, and empty stdout. A successful query retains exit 0 even when the observed run is stopped. Without the option, print the same report as before.

### Host workflow and verification

Extend `docs/operations.md` at its command reference with the option, response example, field meanings, and a short integration sequence. The example assumes a working Linux/macOS installation with configured, authenticated workers and a committed proposal in a clean worktree. The host selects `delivery: local`, launches `run`, displays stdout, and queries status when needed, including after reconnecting. It handles stops through the existing recovery process, commits decision answers in the design, and uses `resume --review` after its plan edits. On `complete`, it reads the branch SHA with Git and handles publication and external gates. Local delivery integrates against the local default branch; keeping that base current and validating the eventual remote merge are the host's responsibilities.

Extend existing CLI/status tests, reusing their stopped, live, interrupted, and stage-boundary fixtures. Assert the five enum results, response fields, report parity on stable observations, decision-question preservation, and the missing-run error. These assertions verify the new public output without introducing another lifecycle test harness.

## Risks / Trade-offs

- Polling can miss intermediate transitions. The host shows existing stdout for live activity; the JSON response describes the current observation, not event history.
- Stop causes and questions remain prose. The host displays them or gives them to its supervising agent; specialized decision forms and automatic failure classification are outside this integration.
