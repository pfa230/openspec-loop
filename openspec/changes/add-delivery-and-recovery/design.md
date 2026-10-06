## Context

`advance()` in `src/controller.ts` runs `proposal-review`, `implementation` and `archive` as real stages, and `integration` and `delivery` as shell commands from `LOOP_FIXTURE` (`src/fixture.ts`). Enrollment creates `loop/<change>` from the commit where `loop run` is given, or works on the user's own branch. `changeBase()` is `git merge-base HEAD <defaultBranch>`, and it feeds the implementer prompt and the implementation-review record. `state.json` records stages, the stop, `owedReview` and `owedFindings`. `owedFindings` points at a findings record that the next implementer turn must address, and `implementation()` already routes such a record: an empty `verdict` means a full round, and `APPROVE` means a minor-fix round. The configuration has no delivery mode and no remote. The archive stage runs `openspec archive <change> --yes` and commits, and a rerun after the change has moved fails with OpenSpec's `not found`.

Git behavior this design relies on, checked with Git 2.53:

- `git rebase <base>` replays the branch's non-merge commits onto `<base>` and drops commits that become empty. That includes a branch that already contains `<base>` through a merge commit: the rebase drops the merge and replays the rest.
- `git merge --no-edit <base>` exits 1 on conflicts and leaves `MERGE_HEAD`, the conflicted files and `MERGE_MSG`. `git commit --no-edit` concludes the merge, even when the resolved tree equals `HEAD`'s.
- `git patch-id --verbatim` ignores line numbers but keeps whitespace. Fed `git diff --unified=0`, it also ignores context lines.

`gh` 2.100 accepts a remote's HTTPS, scp-style or SSH URL as `--repo`, and `gh pr list` filters by `--base`. `git merge --ff-only` overwrites an ignored file in its way unless given `--no-overwrite-ignore`, which makes it refuse.

## Goals / Non-Goals

**Goals:**
- Every Git operation a mode needs, and no others: `local` never contacts a remote, and only `merge` touches the local default branch.
- Each recovery reads the repository or GitHub, never a state flag written before the effect.

**Non-Goals:**
- Fork workflows, a remote other than the default branch's upstream, or pull requests against another repository.
- A preflight for `gh`. A missing `gh` stops the run at delivery, and resume continues after the push the run already made.
- Checkouts forced onto the same branch with `git worktree add --force`. Their files cannot all follow one fast-forward, and Git refuses such checkouts unless forced.
- Re-integrating when the base moves between integration and delivery. That window spans one `openspec archive` and a commit. The run stops, and the person integrates by hand.
- Migrating `state.json` from older runs, which lack `approvedPatch`. The loop is unreleased (#10).

## Decisions

**`delivery` is a required top-level key.** It takes `local`, `pr` or `merge`, and any other value is refused as a wrong type. Like `checks`, it has no default: delivering where the user did not ask is worse than refusing. The local file replaces it as a whole, as it does `defaultBranch`.

**The remote comes from Git, at start.** `prepare()` in `src/commands.ts` resolves the delivery base before anything advances, and `Setup` carries it:

| Mode | Base ref | Upstream |
|---|---|---|
| `local` | `<defaultBranch>` | none |
| `pr` | the upstream ref | the remote `branch.<defaultBranch>.remote`, the remote branch named by `branch.<defaultBranch>.merge`, and the upstream ref from `git rev-parse --symbolic-full-name <defaultBranch>@{upstream}`, such as `refs/remotes/origin/main` |
| `merge` | `<defaultBranch>` | as for `pr` |

Git resolves the upstream ref through the remote's fetch mapping, so the loop never builds `<remote>/<branch>` itself. Fetch and push name the remote and the remote branch; comparisons and merges name the upstream ref.

A missing upstream refuses `loop run` and `loop resume` with exit 2: `default branch main has no upstream; set one with \`git branch --set-upstream-to=<remote>/main main\``. Resolving at start, rather than at integration, means a run without an upstream refuses before its first worker turn instead of after the last. A `remote` config key was rejected. The default branch's upstream is already Git's record of where that branch is published, and a second record could disagree with it. `changeBase()` becomes `git merge-base HEAD <base ref>`. In `pr` mode it must use the remote-tracking ref: after merging the remote's base into the branch, a merge base with a stale local default branch would put the remote's commits into the reviewed patch.

**Integration.** The stage runs these steps in the run's worktree:

1. **Clear an interrupted operation.** If the worktree has a rebase in progress (`git rev-parse --git-path rebase-merge` or `rebase-apply` exists) or a merge in progress (`MERGE_HEAD` exists), the loop aborts it and prints `integration: aborted an unfinished rebase` or `merge`. Integration starts only after implementation completes, and every implementer turn concludes the merge it was handed. An operation in progress here was therefore cut off by an interruption before its findings were written, and redoing the stage reproduces it and its handoff.
2. **Refresh the base.** `pr` and `merge` run `git fetch <remote> <branch>` through the step runner, so `loop stop` can end it, with a transcript. They print `integration: fetched origin/main at 1a2b3c4`. `merge` then compares the local default branch with the upstream ref:
   - **Equal:** nothing to do.
   - **Behind:** fast-forward, after the clean check described under the checkout rules below.
   - **Ahead:** stop with `main is 2 commits ahead of origin/main`. Recovery: push or remove those commits, then resume.
   - **Diverged:** stop with `main and origin/main have diverged`. Recovery: reconcile them, then resume.
3. **Bring the base in.** When `git merge-base --is-ancestor <base ref> HEAD` holds, the branch already contains the base, and this step does nothing. Without that check, a branch holding a conflict merge would be replayed and would hit its conflict again. Otherwise:
   - **`pr`:** `git merge --ff --no-edit <base ref>`.
   - **`local` and `merge`:** `git rebase --no-update-refs <base ref>`. If it fails and `git diff --name-only --diff-filter=U` lists conflicted files, the loop runs `git rebase --abort`, prints `integration: rebase onto main conflicts; merging instead`, and merges.
   - **Explicit flags.** They override `rebase.updateRefs` and `merge.ff` from the user's Git configuration, which would otherwise rewrite other branches or refuse the merge. The loop changes no configuration to get this.
   - **A failure that leaves no conflicted files** is an execution failure of the loop. The loop aborts the rebase first.
4. **Conflict.** When the merge leaves conflicted files, the loop keeps the merge in progress and writes `NNN-integration.findings.json`. It holds one blocking finding, with location `integration` and this problem: `Merging <base ref> (<short hash>) into the change conflicts in: <files>. The merge is in progress in this worktree. Resolve every conflict so that both the change and the base's work survive; the loop concludes the merge.` The stage then reopens implementation (below) and prints `integration: merge of main conflicts in 2 files`.
5. **Patch comparison.** Compare `patchId(merge-base(HEAD, base), HEAD)` with `state.approvedPatch`, where `patchId(a, b)` is `git diff --no-color --no-ext-diff --no-textconv --unified=0 --inter-hunk-context=0 a b | git patch-id --verbatim`. The flags override `color.ui`, external diff drivers, textconv filters and `diff.interHunkContext` from the user's Git configuration: with `color.ui=always`, `git patch-id` reads no patch and prints nothing for any input, and `diff.interHunkContext` adds context lines even under `--unified=0`. Approval snapshots and integration use this one function. If the two differ, the finding's problem reads: `Integrating <base ref> changed the change's patch. Check that the result still implements the plan, and repair what the integration broke.` The stage then reopens implementation.
6. **Checks.** The required checks run through the existing `requiredChecks()`, labelled `integration: check \`<check>\``. Failures become the findings record, as in implementation, and reopen implementation.
7. **Complete.**

To reopen implementation, the loop marks `implementation` and every later stage pending, points `owedFindings` at the record, writes state, and returns `REPLAN`. `advance()` then continues with implementation inside the same advancement. Because the record has no `verdict`, `implementation()` runs a full round on it: an implementer turn, checks, review. That round consumes an implementation attempt from the same per-advancement budget.

Alternatives considered:

- **Merge everywhere.** That is one method, but in `merge` mode every moved base would put a merge commit from the default branch onto the default branch.
- **Rebase everywhere, with one implementer turn per conflict stop.** A rebase can stop on each replayed commit. That needs a loop inside the implementer turn and a rule for counting the stops against attempts.
- **Squash, then rebase.** That gives a single stop, but it folds every attempt's commit, and a user's proposal commit, into one.
- **Review in the integration stage when the patch changes.** Returning to the implementer reuses the one route that conflicts and failed checks already take. The cost is an implementer turn that may change nothing, in a rare case.
- **Skip the checks when the base has not moved.** It saves one check run per run, at the cost of a branch and a test. The checks always run on the integrated result instead.
- **Compare the patch before and after the stage's own rebase or merge, with nothing stored.** An interruption after the rebase would make both sides equal, so a changed patch would pass unreviewed.
- **Store the approved commit and recompute its patch against `merge-base(approved, base)`.** When the base takes in one of the change's own commits, that merge base moves past it, so the recomputed approved patch shrinks with the new one and a changed patch passes unreviewed.

**`approvedPatch` in state.** It holds `patchId(<review base>, HEAD)` taken when implementation completes, which is the patch the approval covers, including approved minor fixes. `<review base>` is the `base` the approving implementation-review record already stores, read from the record the minor fixes were owed on when the stage completes through them, also after a resume. Recomputing `changeBase()` at completion would be wrong when the base takes in one of the change's commits while the reviewer runs. The loop writes it in the same state write that marks implementation complete. Only the patch comparison reads it.

**The implementer turn concludes a merge.** After the worker exits, `implementerTurn()` runs `git add --all` as before. If `MERGE_HEAD` exists, it commits with `git commit --no-edit`, keeping Git's merge message, even when the status is empty. Otherwise it commits as before. The loop adds no check for leftover conflict markers. The required checks and the implementation review see the result, as they see any implementer work.

**Checkout rules for the default branch.** `git worktree list --porcelain` names every checkout holding `refs/heads/<defaultBranch>`. A checkout is clean when `git status --porcelain --untracked-files=no` prints nothing. Untracked files do not count, because a worktrees directory inside a checkout that Git does not ignore shows as untracked, which the contract allows. Fast-forwarding the default branch to commit `C` works like this:

- **When a checkout holds the branch,** the loop runs `git merge --ff-only --no-overwrite-ignore C` in that checkout, so its files follow. Git refuses when the fast-forward would overwrite an untracked file, ignored ones included because of `--no-overwrite-ignore`, which Git otherwise overwrites silently. That failed fast-forward stops the run, and the recovery asks the person to move the named file.
- **When no checkout holds it,** the loop reads the branch's commit once, checks with `git merge-base --is-ancestor` that `C` contains it, and runs `git update-ref refs/heads/<defaultBranch> C <old>` with that same commit as `<old>`. The callers' earlier checks do not suffice: delivery pushes in between, and the branch may move meanwhile.

Each fast-forward prints `<stage>: fast-forwarded main to 1a2b3c4 in checkout <path>`, or without the checkout part when no checkout holds the branch.

**Delivery.**

| Mode | Steps |
|---|---|
| `local` | Print `delivery: local, nothing pushed`. |
| `pr` | Push: `git push <remote> <branch>:refs/heads/<branch>`, with no `-u`, because the loop does not change Git configuration. Then the pull request: `gh pr list --repo <remote URL> --head <branch> --base <remote branch> --state open --json url`. If one is open, print `delivery: pull request already open: <url>`. Otherwise run `gh pr create --repo <remote URL> --base <remote branch> --head <branch> --title <change> --body-file <archived proposal>` and print `delivery: opened pull request <url>`. |
| `merge` | First, every checkout holding the default branch must be clean, and `git merge-base --is-ancestor <defaultBranch> HEAD` must hold, before anything changes. Push: `git push <remote> HEAD:refs/heads/<remote branch>`. Then fast-forward the local default branch to `HEAD`. |

**Delivery mechanics.**

- **Push lines.** A push prints `delivery: pushed <what> to <remote> at 1a2b3c4`, including a repeated push that Git found up to date.
- **Push order in `merge` mode.** The push comes first, so a rejected push leaves the local default branch where it was.
- **Step runner.** Fetch, push and every `gh` call run through the step runner with transcripts, so a hung network call ends with `loop stop`.
- **Failures.** A rejected push, a failed `gh` command, a failed fast-forward or a failed precondition stops the run at the stage. The cause names the command and the transcript, and the recovery says what to fix.
- **PR content.** The archived proposal is `openspec/changes/archive/<date>-<change>/proposal.md`, taking the newest date when several match. `gh` requires a body when it runs without a terminal, and the proposal is what a reviewer of the pull request needs.
- **Repository.** `<remote URL>` is `git remote get-url <remote>`. Passing it as `--repo` keeps `gh` on the upstream's repository when the checkout has several GitHub remotes, and scoping the lookup by `--base` keeps a pull request against another branch from counting.

**Recovery reads effects.** Each recovery inspects actual state:

| Interrupted around | What resume inspects | What it does |
|---|---|---|
| Archival | Whether `openspec/changes/<change>` still exists in the worktree | If it is gone, the loop prints `archive: change already archived`, skips `openspec archive`, and commits any uncommitted result as `<change>: archive`. A clean worktree completes the stage. |
| Integration | `approvedPatch`, the base, and the branch's commits | The stage reruns. Step 1 aborts an operation cut off mid-way, step 3 does nothing when the branch already contains the base, and step 5 compares against `approvedPatch`. |
| Push, fast-forward | Nothing | It repeats the step. Git does nothing when the remote or the default branch is already at the commit. |
| Pull request creation | The open pull request for the branch, from `gh pr list` | It reports that pull request and opens none. |

**Fixtures are removed.** `src/fixture.ts`, `LOOP_FIXTURE`, `FIXTURE_NOTE` and the `(fixture)` marks go. The completion report becomes `Run <change> completed.` followed by the locations, and `loop status` shows `complete` for a completed run. Tests that used a fixture as a stop point use real stops instead: a refused archive, a failing or sleeping stub-agent turn, or a sleeping required check.

**Tests stay local.** The helpers' default configuration uses `delivery: local`. A helper adds a bare repository as `origin`, pushes the default branch, and sets it as the upstream. A stub `gh` on the test PATH answers `pr list` and `pr create`, records its arguments, and keeps the listed pull requests in a file, so a second `pr list` finds the one `pr create` opened. Real `pr` delivery is verified by hand against a disposable GitHub repository.

## Risks / Trade-offs

- **[A clean rebase rewrites commit hashes, so earlier review records and stop reports name commits no longer on the branch]** → The objects stay in the repository until Git prunes them, so `git diff` against them works. The README says so.
- **[After a conflict merge, a later rebase onto a moved base hits the same conflict]** → It aborts and merges, so the cost is Git time, not a worker turn.
- **[An integration that returns to the implementer after the last attempt stops at once with attempts exhausted]** → This matches the per-advancement budget. Resume grants a fresh one.
- **[A `merge`-mode run started on a default branch that holds the unpushed proposal commit stops at integration as ahead]** → The contract requires this stop. The README tells `merge` users to push the proposal before `loop run`, or to propose on a branch of its own.
- **[In `pr` mode, unpushed commits on the local default branch become part of the pull request]** → They are on the change's branch, and the base is the remote's. The README says to push them first.
- **[A conflict inside the change's own planning files, possible only when someone edits that change on the base during the run, stops the run as an implementer plan edit]** → The stop names the commit. The person resolves the plan and resumes.
- **[An interruption in the middle of `openspec archive` can leave spec deltas applied while the change directory still exists]** → Resume then reruns the archive, which fails with OpenSpec's message. The README keeps the manual undo for that case.
