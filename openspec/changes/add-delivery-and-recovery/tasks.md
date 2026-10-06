## 1. Delivery mode and base

- [x] 1.1 Add the required `delivery` key (`local`, `pr`, `merge`) to `src/config.ts`. The local file replaces it as a whole. Give the helpers' `configYaml()` `delivery: local`. Verify with config tests: a missing key refuses and names `delivery`, `delivery: push` refuses as a wrong type, and a local file's `delivery` replaces the committed one
- [x] 1.2 Resolve the delivery base in `prepare()` as the design.md table describes, carry it in `Setup`, and make `changeBase()` use the base ref. Refuse `pr` and `merge` without an upstream, with the design's message. Add a `Repo` helper that creates a bare `origin`, pushes the default branch and sets it as the upstream. Verify with tests: `loop run` in `merge` mode with no upstream exits 2, names `main` and creates no run directory, and the same repository with the helper applied starts the run
- [x] 1.3 Document `delivery` and the upstream rule in `README.md`'s configuration section, including the refusal. Verify that the documented example configuration passes `loop run` in a temporary repository

## 2. Integration

- [x] 2.1 Add `approvedPatch` to `RunState`, written as `null` at enrollment and set in the state write that completes implementation to the patch ID of the approving review record's `base` against `HEAD`, from the one `patchId()` design.md step 5 defines. Verify with stub runs, one approving with no findings and one completing through minor fixes after a resume, that `state.json` holds the patch ID that `git diff --unified=0 <record base> <tip> | git patch-id --verbatim` gives for the branch tip at `implementation: complete`
- [x] 2.2 Make the integration stage real for all three modes, following design.md steps 1 to 7: clearing an interrupted rebase or merge, fetch for `pr` and `merge`, the ancestor check, merge for `pr`, rebase with merge on conflict for `local` and `merge`, the conflict findings record, the `--unified=0 | patch-id --verbatim` comparison against `approvedPatch`, and the required checks. Conflicts, changed patches and failed checks reopen implementation with the findings record. A failed fetch or Git command stops the run as an execution failure. Remove `integration` from `FIXTURE_STAGES` and from the helpers' fixture list. Rework the tests that set an `integration` fixture, listed by `rg -n 'integration' test`, so they stop at a refused archive, a failing or sleeping stub-agent turn, or a sleeping required check, and keep what each test asserts. Verify with stub-agent tests:
  - **Clean rebase.** The repository sets `rebase.updateRefs` to true and `diff.interHunkContext` to 100, the change has two hunks a few lines apart, and a second branch points at the change's first commit. In `local` mode, a commit added to `main` after `implementation: complete` edits a line within three lines of the change's edit in the same file. The run ends with a linear branch on `main`'s tip, the second branch is unchanged, and the implementation reviewer is not called again, so the patch comparison ignored the moved context.
  - **Conflict.** The rebase conflicts, the loop prints the rebase-conflict and merge-conflict lines, and the next implementer prompt carries the integration finding. The implementer turn resolves the file, the loop commits a merge commit with Git's message, and checks and review run before integration completes.
  - **Changed patch.** The repository sets `color.ui` to `always`. `main` already holds one of the change's files with identical content, so the patch changes and the run returns to the implementer. `approvedPatch` in `state.json` is not empty.
  - **Failed check.** A check that fails only on the integrated result returns to the implementer.
  - **`pr` mode.** The repository sets `merge.ff` to `only`. Local `main` tracks branch `trunk` of `origin`, whose fetch refspec maps to `refs/remotes/published/*`. The base moves on `origin`, the fetch refreshes `refs/remotes/published/trunk`, the loop merges that ref, and the branch's earlier commits keep their hashes.
  - **Interrupted handoff.** Stop a run during a sleeping integration check, start a conflicting merge by hand in its worktree, and resume. The run prints `integration: aborted an unfinished merge` and integrates as before.
  - **Base takes in a change commit.** The change has two implementation commits. After approval, `main` merges the first of them by hash and then gains an unrelated commit. Integration finds the patch changed and returns to the implementer.
- [x] 2.3 In `implementerTurn()`, conclude an in-progress merge with `git commit --no-edit` even when the status is empty. Verify with a test where the implementer resolves the conflict by keeping the branch's version, so the tree equals `HEAD`'s: the merge commit still lands, with two parents
- [x] 2.4 Fast-forward the local default branch in `merge`-mode integration under the checkout rules: equal does nothing, behind fast-forwards in the holding checkout, and ahead, diverged or a dirty holding checkout stops at integration with the design's cause and recovery. Verify with tests using the bare `origin`:
  - **Behind.** `origin/main` is ahead, the main checkout's files follow, and the progress line names the checkout.
  - **Ahead.** Stops and names the commit count.
  - **Diverged.** Stops and names both branches.
  - **Dirty.** A modified tracked file in the main checkout stops the run and names the checkout. An untracked file alone does not.
  - **No holding checkout.** With `main` checked out nowhere, `update-ref` moves it.
- [x] 2.5 Document integration in `README.md`:
  - the three methods by mode and the conflict handoff
  - the changed-patch return
  - `merge` mode's sync of the default branch and its stops
  - that a rebase rewrites the commits named in earlier review records
  - that `merge` users push the proposal commit first or propose on a branch of their own
  - that unpushed default-branch commits join a `pr`-mode pull request

  Verify each documented stop and recovery against a stub-agent run in a temporary repository

## 3. Delivery

- [x] 3.1 Add a stub `gh` to the test helpers that records its arguments, answers `pr list` with the pull requests in a file, each with its URL, base and head, filtered by the `--head` and `--base` it was given, and on `pr create` adds a pull request with a fixed URL to that file and prints the URL. Verify by its use in 3.2
- [x] 3.2 Make the delivery stage real as the design.md delivery table and mechanics describe: `local` prints its line, `pr` pushes without `-u` and opens or reports the pull request with the archived proposal as the body, and `merge` checks its preconditions, pushes `HEAD` to the remote's default branch and then fast-forwards the local default branch. Fetch, push and `gh` run through the step runner with transcripts. Remove `src/fixture.ts`, `LOOP_FIXTURE`, `FIXTURE_NOTE` and the `(fixture)` marks, and make the completion report `Run <change> completed.` with the locations. Rework the remaining tests that use the `delivery` fixture or the fixture wording, listed by `rg -n fixture test`, in the same way. Verify with tests:
  - **`local`.** Nothing is pushed, and `main` and `origin` are unchanged.
  - **`pr`.** `origin` holds `loop/add-thing` at the branch tip, the branch has no upstream configured, `gh pr list` and `gh pr create` both received `--repo` with `origin`'s URL, `gh pr list` received `--base main`, `gh pr create` received `--base main --head loop/add-thing --title add-thing` and the archived proposal, and local `main` is unchanged.
  - **`merge`.** `origin/main` and local `main` both equal the branch tip, and the main checkout's files follow.
  - **`merge` push rejected.** A commit pushed to `origin` from another clone after integration stops the run at delivery with Git's message, and local `main` is unchanged.
  - **`merge` preconditions.** A dirty main checkout stops the run before any push. So does a local commit on `main` that the branch lacks.
  - **Ignored file in the way.** An ignored file in the main checkout at a path the change adds survives with its content, local `main` stays where it was, and the run stops at delivery naming the failed fast-forward.
- [x] 3.3 Document delivery per mode in `README.md`, including the pull request's title and body, the push order in `merge` mode, and what each stop's recovery asks. Replace the "Fixture stages" section, and remove `LOOP_FIXTURE` from every example. Verify each documented recovery against a stub-agent run in a temporary repository

## 4. Recovery

- [x] 4.1 Make the archive stage skip `openspec archive` when `openspec/changes/<change>` is gone from the worktree, commit any uncommitted result as `<change>: archive`, and complete. Verify with tests:
  - **Archive not committed.** A run killed after the stub `openspec` moved the change, simulated by moving it by hand before resuming a run stopped at archive, resumes to completion with one `add-thing: archive` commit and no second `openspec archive` call.
  - **Archive committed.** A resume after the archive commit completes the stage without a new commit.
- [x] 4.2 Make `pr` delivery open no pull request when `gh pr list` finds one open for the branch against the remote branch, and report it instead. Verify with tests:
  - **`pr` resume.** The stub `gh pr create` records the pull request and then exits 1, which stands in for an interruption after GitHub opened it. The run stops at delivery. On resume, the run prints `pull request already open`, and `gh pr create` has been called once in total.
  - **`merge` resume.** An untracked file in the main checkout at a path the change adds makes the fast-forward fail after the push, so the run stops at delivery. After the file is removed, resume completes, and `origin/main` and local `main` both equal the branch tip.
- [x] 4.3 In `README.md`, replace the manual archive undo with the automatic recovery, keep the undo only for an interruption inside `openspec archive` itself, and describe resume after an interrupted push, merge or pull request. Verify the documented undo in a temporary repository

## 5. Real acceptance

- [x] 5.1 In disposable local repositories with real OpenSpec 1.14.0, a bare `origin` and stub or real agents, run one change through `local` and through `merge`. Then make one `merge` run hit a conflict that the implementer resolves. Verify:
  - `local` leaves `main` untouched.
  - `merge` fast-forwards and pushes `main`.
  - The conflict run ends with a merge commit and a reviewed resolution.
  - A dirty checkout, unpushed commits, a diverged branch and a rejected push each stop with their cause.
- [x] 5.2 Create a private disposable GitHub repository with `gh repo create`, then run one change through `pr` mode against it. Interrupt the run with `loop stop` during delivery and resume it. Verify that one pull request is open against the default branch, its body is the archived proposal, and local `main` is unchanged. Report the repository's URL so pfa can delete it

## 6. Final checks

- [ ] 6.1 Run `openspec validate add-delivery-and-recovery --strict` and `npm test`, and verify on the pull request with `gh run watch` that CI passes on Linux and macOS
