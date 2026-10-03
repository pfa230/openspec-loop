## Why

openspec-loop is being rebuilt from scratch, and every later build step (#2 to #10) needs one short contract to build against. The legacy repository (pfa230/openspec-loop-legacy2) grew a participant and provenance framework, digest-bound review records, exhaustive archive replay and numbered invariants. It is kept as a source of failure examples, not of requirements, so the new contract starts empty and admits a guarantee only when a concrete delivery requirement needs it.

## What Changes

- Add the product contract as the first main spec: the complete user workflow, from proposing a change with the user to a delivered change, and the loop's ownership boundary.
- Divide attended from unattended work at the committed proposal. The user proposes with native `/opsx:propose` and commits the proposal on the default branch. `loop run <change>` takes it from there and runs everything after it without the user.
- Define explicit enrollment. The loop owns only the change named in `loop run` and the result it delivers. Native OpenSpec work outside a run stays independent and unpoliced.
- Define one deterministic controller that owns review, autonomous plan revision, implementation, testing, integration, archival and delivery, controlled only through its commands, so a person can run it from a terminal or a Claude or Codex session can supervise it with the supervision skill the loop ships.
- Define three independently configured roles (proposal reviewer, implementer, implementation reviewer), with same-model configurations allowed and review independence provided by a separate context, not by identity checks. Findings are blocking or minor, and minor-only reviews approve with fixes.
- Define bounded attempts, configurable execution restrictions, a lightweight pre-archive gate, integration with the current default branch before archival, three delivery modes (`local`, `pr`, `merge`) that change the default branch only by fast-forward and stop loudly otherwise, and explicit resume. The loop fails predictably and investigates nothing; a supervising session diagnoses failures.
- Define progress reporting for every step, with usage and cost for worker steps and transcripts kept, and the rule that required check failures block delivery without authorizing unrelated repair.
- No compatibility with legacy state, artifacts, commands, schema or invariant numbering.

## Capabilities

### New Capabilities

- `loop-workflow`: the openspec-loop product contract, covering enrollment, attended proposal, controller ownership, roles, reviews, autonomous plan revision, the implementation cycle, the pre-archive gate and native archival, integration and delivery, run control and progress reporting.

### Modified Capabilities

None. The repository has no main specs yet.

## Impact

- Adds `openspec/specs/loop-workflow/spec.md` at archive. No code, package or configuration changes.
- Later build issues extend or modify `loop-workflow` instead of restating it in parallel component specs. #2 bases the README and repository agent instructions on it.
- Running several changes unattended is deferred to #13, and the scoping session to #14.
