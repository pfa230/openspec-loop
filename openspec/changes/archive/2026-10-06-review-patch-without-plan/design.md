## Context

`implementationReview()` in `src/controller.ts` takes `changeBase()`, the merge base of `HEAD` and the base ref, and the prompt from `implementationReviewPrompt()` in `src/prompts.ts` tells the reviewer to review `git diff <base> <commit>`. `complete()` records `approvedPatch` as `patchId(worktree, base, "HEAD")`, and `integration()` compares `patchId(worktree, changeStart, "HEAD")` with it. `patchId()` in `src/git.ts` diffs the whole tree. See proposal.md for the failure this causes.

Every plan change on the run's branch comes from one of three places: the proposal commit when the proposal sits on its own branch, the plan reviser's commits (`<change>: revise plan`, `<change>: apply minor plan fixes`), and decisions the user commits after a decision stop. `implementerTurn()` stops the run on any implementer edit under the change's directory other than a tick, through `planDigest()`, which already covers every file there. So the change's directory never holds implementer work a reviewer must judge.

## Goals / Non-Goals

**Goals:**
- The reviewer sees only the implementer's work, whatever changed the plan on the branch.
- One definition of the change's patch, used by the review and by the integration comparison.

**Non-Goals:**
- Migrating the `approvedPatch` of a run stopped at integration before this change. Its recorded ID covers the whole tree, so on resume the comparison reads as a changed patch and the implementer gets one extra round. The loop is unreleased.

## Decisions

**One pathspec excludes the change's directory.** `src/plan.ts` gains `outsideChange(change)`, returning `:(top,exclude)openspec/changes/<change>`. `top` anchors the path at the worktree root, so the reviewer gets the same patch from any directory it runs `git diff` in. Without `top`, Git resolves an exclude pathspec against the current directory and excludes nothing from a subdirectory (checked with Git 2.53).

Alternatives considered:
- **Diff from the last plan commit instead of the change base.** That needs the loop to find or store that commit, and a decision the user commits after implementation has started would still land inside the range.
- **Tell the reviewer in prose to ignore plan files.** Run D's reviewer already had "Task completion marks in the tasks file are bookkeeping, not part of the plan" and still judged the plan change. A diff that does not hold the plan leaves nothing to misjudge.

**The review prompt.** `implementationReviewPrompt()` reads "Review the patch `git diff <base> <commit> -- '<pathspec>'`, which leaves out the change's directory: the plan there is approved and is not under review." This replaces the sentence on task completion marks, which the patch no longer holds. The single quotes keep the shell from reading the parentheses; change names are kebab-case, so the path needs no further quoting.

**`patchId()` takes the pathspec.** Its signature becomes `patchId(cwd, from, to, pathspec)`, and the pipeline appends `-- "$3"`. Both callers pass `outsideChange(state.change)`. With the patch defined once, the integration comparison follows it: a plan edited by hand while the run is stopped at integration no longer returns the run to the implementer, which the existing "Plan edited while stopped" scenario already promises.

**The implementer's prompt keeps the whole-tree `git diff <base>`.** The implementer reads it to see the work so far and judges nothing in it. The tick marks it shows in `tasks.md` are its own bookkeeping.

## Risks / Trade-offs

- **[An implementer edit under the change's directory leaves the reviewed patch]** → `planDigest()` stops the run on every such edit before any review. The one gap is a turn interrupted before the loop compares digests, which the contract already accepts. Until now such an edit showed in the reviewed patch; after this change it does not, and the reviewer reads the edited plan as the approved one. The contract does not check that turn, and this change adds no check for it.
- **[A reviewer still raises a finding against the plan files it reads]** → The prompt says the plan is not under review. If one does and the implementer applies it, the run stops as today, and the stop names the commit.
