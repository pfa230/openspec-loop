## 1. Remove plan staleness

- [ ] 1.1 Remove `planChanged()`, the plan check at the top of `advance()`, `approvedPlan` from `RunState` and enrollment, and the `plan` field from proposal-review and plan-problem records. Keep `reopenPlan()` for the `planProblem` path. Verify by deleting or reworking the stage tests that rely on staleness: hand-edited plans, a fixture editing the plan, an unreadable plan at a stage boundary, and completed runs whose plan changed. Rework the shared-budget test to return to proposal review through a `planProblem`, and drop the `approvedPlan` and `plan` assertions. `npm test` passes
- [ ] 1.2 Add one stub-agent test for the reworded "Plan edited while stopped" scenario. Stop a run at the integration fixture, edit a task's text by hand, and resume. Verify that the run completes with no further reviewer or implementer call
- [ ] 1.3 On an implementation-review finding with a question, call `reopenPlan()` and write state before returning the decision stop. Verify by updating the implementation decision-stop test: after the user commits a decision and resumes, the first progress line is `proposal-review: review 1 of 3 started (reviewer)`, and implementation completes after reapproval

## 2. Implementer plan edits fail the run

- [ ] 2.1 In `implementerTurn()`, digest the plan before the worker starts and again after the commit. Return the halt from design.md when the digests differ, before the `planProblem` branch. Verify by reworking the two implementation tests that expect a return to proposal review. An implementer turn and a minor-fix turn that each edit a task's text stop the run with the cause and recovery naming the commit, and no reviewer runs afterward. A turn that only ticks a box continues

## 3. Native archival

- [ ] 3.1 Give the test `openspec` stub the `archive` branch from design.md and a `Repo` method that creates its refusal marker. Remove `archive` from `FIXTURE_STAGES` in `src/fixture.ts` and from the helpers' fixture list. Verify that the updated fixture tests name `integration` and `delivery`, and that the completion report and `loop status` say "Stages integration and delivery were fixtures and did no real work."
- [ ] 3.2 Make the archive stage real as design.md describes: run `openspec archive <change> --yes` in the run's worktree, commit the worktree as `<change>: archive`, stop on a refusal with the cause and recovery, and print the progress lines. Print `<stage>: complete` without `(fixture)` for every non-fixture stage. Verify with stub tests that a full run prints `archive: started`, `archive: committed <hash>` and `archive: complete`, that the run's branch ends with an `add-thing: archive` commit holding the moved change, and that a refused archive stops at `archive` with no new commit. After the marker is removed, resume archives. Update the tests that take the branch tip for a revision, fix or candidate commit, or that list the run's commits (`test/stage.test.ts`, `test/implementation.test.ts`, and `test/enrollment.test.ts`'s committing fixture and branch-tip checks), to select those commits by subject instead. Verify that a run stopped at the delivery fixture resumes to completion after archival has moved the change directory
- [ ] 3.3 Document in `README.md`:
  - the archive stage, its commit and its refusal recovery
  - that an implementer editing the plan stops the run
  - that edits made by hand while a run is stopped are not reviewed again
  - the shrunken fixture file

  Remove the plan digest from the proposal-review record description, the "Approval" bullet's re-review of edited plans, and the note that pre-#4 runs review their plan again on resume. Verify each documented recovery against a stub-agent run in a temporary repository

## 4. Real archival acceptance

- [ ] 4.1 In a disposable repository with real OpenSpec 1.14.0, run a change that adds a requirement to a main spec through the loop, with stub or real agents and one required check. Verify that implementation is reviewed and checked, that `openspec/specs/<capability>/spec.md` on the run's branch holds the added requirement, and that the change lies under `openspec/changes/archive/` in the `<change>: archive` commit

## 5. Final checks

- [ ] 5.1 Run `openspec validate add-native-archival --strict` and `npm test`, and verify on the pull request with `gh run watch` that CI passes on Linux and macOS
