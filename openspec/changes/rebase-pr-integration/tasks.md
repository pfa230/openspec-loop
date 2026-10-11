# Tasks

## 1. Unify integration

- [x] 1.1 Remove the PR merge shortcut in `src/controller.ts` so every mode uses the existing rebase-first path and merges only after aborting a conflicted rebase; update the custom-fetch-mapping PR test in `test/integration.test.ts` to verify the fetched remote base, rebased ancestry, no integration merge commits on the delivered branch and unchanged local default branch.
- [x] 1.2 Extend the existing conflict regression in `test/integration.test.ts` to PR mode with a moved upstream; verify the conflicting rebase is aborted, the merge conflict reaches the implementer, the resolution is committed and the integrated result is checked and reviewed before delivery.
- [x] 1.3 Update README's "Bringing the base in" paragraph to state the shared rebase-first rule and conflict fallback; verify it agrees with the delta's Integration method and retains the existing explanation of rewritten commit IDs and Git configuration overrides.

## 2. Verify PR publication and recovery

- [x] 2.1 Add coverage in `test/delivery.test.ts` using existing step boundaries and the bare origin fixture; verify no remote change branch or PR commands appear before delivery, then verify delivery publishes the archived branch and opens the PR.
- [x] 2.2 Add an already-pushed user-branch regression in `test/delivery.test.ts` without adding an enrollment check or delivery behavior: move the upstream base, verify integration replaces a published commit by rebase and the delivery push stops with Git's rejection, transcript and continuation command, leaves the remote tip and local default branch unchanged and runs no `gh` command; reconcile the published history in the fixture, explicitly resume and verify delivery succeeds without repeating completed stages.
- [x] 2.3 Update README's integration/PR delivery guidance for already-pushed user branches: verify it explains that the loop may rebase them, pushes only at delivery without force, and stops on a non-fast-forward rejection until the user reconciles the branch and explicitly continues.

## 3. Validate the change

- [x] 3.1 Run `npm test` and `openspec validate rebase-pr-integration --strict`; verify both pass, then run the required cut pass against the amended contract and remove any mechanism or task without a concrete delivery need.
