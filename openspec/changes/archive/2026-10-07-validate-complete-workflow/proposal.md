## Why

Changes #3 to #8 each checked their own stage with real harnesses, but no run has yet gone from a committed proposal to a delivered result through every stage, under a supervising session, with the recoveries the contract promises. Before #10 releases the package, the whole workflow needs real evidence against the contract in `openspec/specs/loop-workflow/spec.md`. This is build step 9 (#9).

## What Changes

- **Real end-to-end runs in disposable repositories.** Each run uses real OpenSpec and the loop built from this repository. Together the runs cover:
  - **Supervision:** a Claude Code session, a Codex session and a plain terminal.
  - **Adapters:** all four shipped adapters (`loop-claude`, `loop-codex`, `loop-agy`, `loop-opencode`) in real roles.
  - **Delivery:** all three modes (`local`, `pr`, `merge`).
- **The contract's revision and recovery cases, exercised for real:**
  - Autonomous plan revision and implementation revision.
  - A decision stop, and every role filled by the same agent.
  - `loop stop` and resume, and a killed advancing process taken over by resume.
  - A harness failure and exhausted attempts, each diagnosed by a supervising Claude and Codex session.
  - Concurrent runs of two changes.
  - Integration with a moved default branch.
  - The loud default-branch stops in `merge` mode.
  - Native OpenSpec work outside a run.
- **Two measurements.** Each run's `Usage by role` block, with the implementer's usage per attempt as evidence for the fresh-context implementer decision of #5. And the commands a person types from proposal to delivered result in each delivery mode.
- **Evidence goes on issue #9**, one comment per run and a closing summary, and nothing is added to the repository. The test suite stays the fixture coverage, and every run here uses real harnesses, real OpenSpec and real Git.
- **Each defect becomes its own issue.** A case that breaks the contract is recorded on #9 and filed as a new issue, fixed by its own change, and run again here once the fix is merged.

Not in this change:

- Code, test, skill or README edits. Fixes belong to the defect issues.
- Line counts against `openspec-loop-legacy2`, and any other comparison with the legacy repository.
- New automated tests. The existing suite is the fixture coverage, and the real runs are the evidence.
- Packaging and installation from the published artifact, which #10 covers.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The change validates the existing `loop-workflow` contract and changes no requirement, so it sets `skip_specs: true`.

## Impact

- The repository gains only this change's directory, archived when the change completes.
- Issue #9 gains the evidence comments, and new issues record any defects found.
- Running the cases spends real harness usage and creates disposable local repositories and one private disposable GitHub repository. Its URL is reported so pfa can delete it.
