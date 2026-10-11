# openspec-loop

openspec-loop takes an OpenSpec change you proposed and committed, and runs it unattended to a reviewed, implemented, tested, archived and delivered result. You attend the proposal; the loop handles everything after it.

## Prerequisites

- Node 24 or later, on Linux or macOS
- OpenSpec 1.14.0 or later, as the `openspec` command on PATH
- Git
- A repository initialized with `openspec init` for the tools you use, which installs OpenSpec's own skills and commands in the project
- The CLI of each harness your agents use: `claude`, `codex`, `agy` or `opencode`

## Installation

```sh
npm install -g openspec-loop
```

This installs the `loop` command and the four adapters described under Agents and adapters. When npm's global prefix belongs to root, as with a system-wide Node, give npm a prefix you own, such as `npm config set prefix ~/.npm-global` with `~/.npm-global/bin` on PATH, rather than installing with `sudo`. To upgrade, run `npm update -g openspec-loop`, then copy the skills into each project again, as Setting up a project describes.

## Setting up a project

In a repository set up for OpenSpec:

1. Write `openspec/loop.yaml` as Configuration describes, and commit it.
2. Add the worktrees directory and `openspec/loop.local.yaml` to `.gitignore`, for example:

   ```
   .worktrees/
   openspec/loop.local.yaml
   ```

   Put your personal overrides in the main checkout's `openspec/loop.local.yaml`. Fresh issue worktrees inherit them automatically; no copy is needed.

3. Copy the supervision and scoping skills into the project for Claude Code and Codex, and commit the copies:

   ```sh
   for dir in .claude/skills .agents/skills; do
     mkdir -p "$dir"
     for skill in openspec-loop openspec-scope; do
       cp -R "$(npm root -g)/openspec-loop/skills/$skill" "$dir/"
     done
   done
   ```

   Run the same command and commit again after every upgrade: the skill describes the commands and flags of the installed version, and nothing detects a stale copy.

Setup changes nothing else in the project. The loop installs no Git hooks and needs no OpenSpec schema or configuration of its own.

## Configuration

Commit `openspec/loop.yaml` in the repository. It names the default branch, which the loop does not detect, the directory for the worktrees the loop creates, the agents that do the work, the role each agent fills, the attempt budgets, the required checks and how the change is delivered:

```yaml
defaultBranch: main
worktrees: .worktrees
agents:
  gpt: [loop-codex, -m, gpt-5.5, -s, read-only]
  opus: [loop-claude, --model, opus, --permission-mode, auto]
roles:
  proposalReviewer: gpt
  planReviser: opus
  implementer: opus
  implementationReviewer: gpt
attempts:
  proposalReview: 3
  implementation: 3
checks:
  - npm test
delivery: pr
```

- `worktrees` is the directory where a run started on the default branch gets its worktree, at `<worktrees>/<change>`, and a scoping session gets its worktree at `<worktrees>/scope-<session>`. A relative path is relative to the invoking checkout; an absolute path is used as written. Existing runs and sessions keep their worktrees when this setting changes. The loop never edits ignore rules: when the directory lies inside a checkout, add it to `.gitignore`, or to `.git/info/exclude` for one clone only, because an unignored worktree makes that checkout dirty.
- `agents` maps an alias of your choice to the command that runs that agent. Define one agent per harness and model you use, such as `opus` and `fable`, or `deepseek` and `mimo` on OpenCode. Progress lines name agents by alias.
- `roles` assigns an agent to each role. The proposal reviewer judges the plan; the plan reviser revises it and applies minor plan fixes; the implementer implements the plan and applies minor implementation fixes; the implementation reviewer judges the patch. One agent may fill several roles: every turn runs in a fresh context.
- `attempts.proposalReview` bounds how many proposal reviews one advancement runs, and `attempts.implementation` how many implementation attempts.
- `checks` lists the required checks, each a shell command run with `sh -c` in the run's worktree. `checks: []` means the change has no required checks; leaving `checks` out refuses the run.
- `delivery` is `local`, `pr` or `merge`, and has no default. `local` contacts no remote. `pr` and `merge` use the remote of the default branch's upstream, as Git records it, and its branch there; `loop run`, `loop resume`, `loop step` and `loop scope finish` refuse them when the default branch has no upstream. Set one with `git branch --set-upstream-to=origin/main main`.

Put settings you do not want to commit, such as your own agents, in the main checkout's `openspec/loop.local.yaml`, and add that file to `.gitignore`. They apply across that clone's worktrees. A worktree can also have its own `openspec/loop.local.yaml` to override them. At each layer, `defaultBranch`, `worktrees`, `checks` and `delivery` replace the preceding value as a whole, and `agents`, `roles` and `attempts` replace entries individually, so a local file can add one agent and point one role at it:

```yaml
agents:
  deepseek: [loop-opencode, -m, deepseek/deepseek-v4]
roles:
  proposalReviewer: deepseek
```

Every `loop run`, `loop resume` or `loop step` reads settings again in this order: the invoking checkout's committed `openspec/loop.yaml`, the main checkout's optional `openspec/loop.local.yaml`, then the invoking checkout's optional local file when it is a different checkout. The main checkout is the clone's primary working tree, regardless of its current branch. A bare clone has no main checkout, so only the invoking files apply.

The loop uses Git's directory and worktree records to locate the main checkout. If those records do not identify an accessible working tree of this clone, it refuses. With a separated Git directory, invocation directly from the main checkout works; invocation from a linked worktree refuses when Git reports the metadata directory instead of the main checkout.

A missing committed file, an unreadable present file, invalid YAML, an unknown key or a wrong type in any file, or a required field missing after merging, refuses the command. An invalid main local file cannot be hidden by a worktree override. So does a role whose alias is undefined or whose agent's command cannot be found: a command without `/` is looked up on PATH, and one with `/` is taken relative to the invoking checkout, even when defined in the main local file. Relative `worktrees` paths also remain relative to the invoking checkout.

Both `loop scope` commands use the same configuration merge order, including shared main-checkout and invoking-checkout overrides, but do not resolve worker commands or start workers. Scoping still requires structurally valid configuration.

### Agents and adapters

An agent's command is an adapter followed by arguments for its harness. The package ships four adapters, each verified with the harness version shown:

| Adapter | Harness | Read-only reviewer arguments | Editing plan reviser and implementer arguments |
|---|---|---|---|
| `loop-claude` | Claude Code 2.1.293 | `--permission-mode plan` | `--permission-mode auto` |
| `loop-codex` | Codex 0.160.0 | `-s read-only` | `-s workspace-write` |
| `loop-agy` | Antigravity 1.2.17 | none | `--dangerously-skip-permissions` |
| `loop-opencode` | OpenCode 1.18.34 | `--agent plan` | none |

Each adapter writes the usage its harness reports to the usage file, even when the harness then fails:

| Adapter | Token counters | Cost |
|---|---|---|
| `loop-claude` | `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `output_tokens` | Reported |
| `loop-codex` | `input_tokens`, `cached_input_tokens`, `cache_write_input_tokens`, `output_tokens`, `reasoning_output_tokens` | Not reported |
| `loop-agy` | `input_tokens`, `cache_read_tokens`, `output_tokens`, `thinking_tokens` | Not reported |
| `loop-opencode` | `input`, `cache.read`, `cache.write`, `output`, `reasoning`, summed over the model steps of the turn | Reported, summed likewise |

Counters keep the harness's own names, because the harnesses count differently: Claude Code's `input_tokens` leaves out cache reads, while Codex's `input_tokens` includes its `cached_input_tokens`. A cost is the harness's own figure. Claude Code reports list price even under a subscription, and OpenCode reports `0` for a model it has no price for.

Add the model flag of the harness (`--model`, `-m`) to choose a model. Without restriction arguments, a harness runs with its own defaults; headless Claude Code and Codex cannot edit files by default.

Claude Code's auto mode needs a model and account that support it. Without it, Claude Code starts in its default mode and denies the commands an implementer needs to run, such as the checks. In auto mode, a classifier judges every edit inside a `.git` directory and may refuse one, so an editing Claude agent whose `worktrees` directory lies inside the repository's Git directory can be refused edits there. `--permission-mode bypassPermissions` approves them all. Run such an agent inside a sandbox if you want to limit what it can do: put the sandbox command first, for example `[ai-jail, --exec, ..., loop-claude, ...]`.

OpenCode has no way to enforce a reply schema, so `loop-opencode` asks for bare JSON and fails the step when the final message is anything else. With `--agent plan`, OpenCode rejects reads outside the repository without asking and can end with no final message; the step then fails, and `loop resume` runs it again.

To use another tool, write your own adapter. The loop runs the agent's command with four paths appended: a prompt file, a JSON schema file, a reply file and a usage file. Take the paths from the last four arguments, since the agent's own arguments come first. The command runs in the run's worktree with no input, and its output becomes the step's transcript. It must exit 0 after writing a JSON object that matches the schema to the reply file; anything else stops the run as an execution failure.

The command may also write what its harness reported spending to the usage file, as a JSON object with two optional keys: `tokens`, which maps each token counter, under the harness's own name, to a non-negative number, and `costUsd`, a non-negative cost in US dollars. Without a usage file, the step's usage shows as unavailable. A usage file that is not such an object stops the run as an execution failure.

## Scoping proposals together

Invoke `/openspec-scope` in Claude Code or `$openspec-scope` in Codex to prepare proposals in an attended session. The skill follows the repository's issue-listing instructions, explains its recommended order and waits for your issue selections. It uses native OpenSpec proposing, reviews material decisions with you, records routine defaults in the design, trims each proposal to one implementable change and commits its artifacts separately. Explicitly invoking the skill authorizes filing trimmed requested work as follow-up issues linked to the source issue and OpenSpec change, with a backlink in the proposal's non-goals. Source issues stay open until implementation.

You can also use the deterministic commands directly, with no options:

| Command | What it does | Exit status |
|---|---|---|
| `loop scope start <session>` | Creates branch `scope/<session>` and a separate worktree from the committed local default branch, without fetching or changing that branch. Prints the worktree, branch and finish command. | 0 created, 2 refused |
| `loop scope finish <session>` | Rebases the clean session onto the current base, then delivers its committed proposals using `delivery`. Retains the branch and worktree. | 0 delivered, 1 integration/publication failed, 2 refused |

Git validates the generated branch name; no separate naming format is imposed. Existing branch or path collisions refuse without replacement and identify a registered checkout when one exists. Finish discovers the checkout through Git's worktree list. If it cannot find one, use `git worktree list` to locate a detached manual rebase, complete or abort it, or restore the session checkout before retrying.

Run start and finish from the same invoking checkout to retain its configuration and ignored local overrides. The session checkout inherits shared main-checkout settings through configuration reading, but does not receive a copy of the invoking checkout's `openspec/loop.local.yaml`. Use the reported session worktree explicitly as the working directory for native proposing, every OpenSpec artifact command and each proposal commit. Check the root from `openspec list --json` and the paths from native OpenSpec instructions before writing or staging: they must resolve inside that worktree. Follow the selected OpenSpec store's instructions if the project uses a store. Run scope commands and proposal commits with permission to write the shared Git directory; in Codex, request escalated permissions as with the supervision skill. Do not author in the default checkout when a sandbox refuses Git writes.

Native proposing may stop for review. Inspect its artifacts and request the next action explicitly before the attended workflow continues. Record `Source issue: <URL>` in each proposal and decisions/defaults in `design.md`; commit only `openspec/changes/<change>/`, for example `docs(scope): propose <change> (relates to #14)`, without closing keywords. Interrupted drafting resumes in the same worktree: inspect its files and Git history, retain finished proposal commits, and continue the draft. Finish refuses any uncommitted tracked or untracked work, including an unfinished proposal, with exit 2. Complete the draft or deliberately move it elsewhere first; finish does not commit, stash or remove it.

Session delivery differs from run delivery:

| Mode | Base and delivery |
|---|---|
| `local` | Rebase onto the current local default branch, then fast-forward it without remote contact. Local **run** delivery instead leaves the default branch untouched. |
| `pr` | Fetch and rebase onto the default branch's configured upstream, push the session branch without force, then find or create one PR against that upstream branch/repository. The local default branch stays unchanged. New PRs use `gh pr create --fill`, preserving issue-bearing proposal commit subjects. |
| `merge` | Fetch and safely synchronize the local default branch with its upstream, rebase onto it, push the session tip to the upstream default branch, then fast-forward the local default branch. |

Default updates require clean tracked files in any checkout holding that branch, preserve unrelated untracked files and stop if Git would overwrite a file, including an ignored one. An ahead or diverged local default in `merge`, a dirty default holder, a conflict, a rejected push or a failed fast-forward exits 1 with attended recovery. Syntax/configuration problems, invalid names, collisions, missing session checkouts, uncommitted session work and a missing required upstream refuse with exit 2. A conflicting finish rebase is aborted; reconcile manually in the session worktree before retrying. No automatic merge fallback, force push, implementation, enrollment or archival occurs.

Retry finish from the original invoking checkout after resolving its reported cause. If a merge push succeeded before the local update failed, retry can complete the safe local update. An open PR is reused only after the retry's non-force push succeeds. If rebasing onto a moved base rewrites an already-published session branch, Git can reject that push. In the session worktree, fetch the upstream remote's session branch and current base, merge the published session history into the rebased branch, then merge the current base if it is not already an ancestor. For example, substituting the actual upstream remote and branch names:

```sh
git fetch origin scope/planning main
git merge --no-edit origin/scope/planning
git merge --no-edit origin/main       # if not already an ancestor of HEAD
```

Resolve and commit any conflicts before retrying `loop scope finish planning` from the original invoking checkout. Both the published tip and current base must be ancestors of the session tip; finish then avoids another rebase and can push without force. Resetting only to the published tip would repeat the rebase and rejection.

After proposals land, explicitly run `loop run <change>` or `loop step <change>` from the default branch. In `pr` mode, merge the proposal PR there first. Enrolling from the multi-proposal session branch includes sibling proposal commits in the selected change's patch. Finishing scoping leaves proposals unarchived and unenrolled, and keeps the session checkout for inspection or manual Git cleanup.

## Running a change

Propose the change with OpenSpec's own proposing, `/opsx:propose` in Claude Code or the `$openspec-propose` skill in Codex, and commit it. The proposal must be committed on the branch the run works on, which you choose by where you enroll through `loop run` or `loop step`:

- **On the default branch.** Commit the proposal on the default branch and run `loop run <change>` there. The loop creates branch `loop/<change>` from that commit in a worktree under `worktrees` and leaves your checkout's files and index untouched.
- **On a branch of its own.** Create a worktree on a new branch, propose and commit there, and run `loop run <change>` in that worktree. The run works in that worktree, which must have no uncommitted changes.

The commands work from any checkout of the repository:

| Command | What it does | Exit status |
|---|---|---|
| `loop run <change>` | Starts a run and advances it in the foreground, printing a progress line as each step starts and ends, then a report. | 0 completed, 1 stopped, 2 refused |
| `loop step <change>` | Enrolls a new run or continues an existing one, returning after the first pending stage succeeds with its normal review/revision cycle. Reports the next stage and how to continue. | 0 boundary or completed, 1 stopped, 2 refused |
| `loop resume <change> [--attempts <n>] [--implement]` | Continues a run that is between stages, stopped or interrupted, from its first incomplete stage, with a fresh attempt budget: the configured one, or `<n>` when given. `--implement` first makes implementation and every later stage incomplete, so the implementer implements the plan as it stands; it is refused once the change is archived. | 0 completed, 1 stopped, 2 refused |
| `loop stop <change>` | Ends the current step at once; the run reports how to resume. Ctrl-C and closing the terminal do the same. | 0, 2 if there is no run |
| `loop status <change>` | Shows the run's state, branch, stages and locations. | 0, 2 if there is no run |

To inspect an approved plan and then a reviewed implementation, use the same committed change with:

```sh
loop step <change>     # proposal review, including revisions and minor fixes
loop status <change>   # between stages; implementation is next
loop step <change>     # implementation, including checks, review and revisions
loop resume <change>   # continue through integration, archive and delivery
```

You can keep using `step` for integration, archive and delivery instead. Each successful boundary returns control with exit status 0 while the run remains incomplete; its report and `status` name the next stage and continuation commands. Delivery reports the whole run complete. `run` still refuses an already-enrolled change. Attempt overrides and reopening implementation remain options of `resume` only.

Each `step` call receives fresh configured attempt budgets. If implementation returns the plan for revision or integration returns findings to implementation, the same call follows that handoff and returns when the first stage succeeds; the next stage can therefore be an earlier one. Failures and decision questions stop with the usual cause and recovery. After resolving the stop, use `step` or `resume` explicitly to continue.

When a worker step ends, its progress line names the agent and what the harness reported it spent, such as `(gpt; input_tokens=16641, cached_input_tokens=0, output_tokens=59, reasoning_output_tokens=21, cost unavailable)`. The counters and cost are exactly what the harness reported. A value it did not report reads `unavailable`, never zero, and `usage unavailable` means it reported nothing.

The report at the end of `loop run`, `loop resume` and `loop step`, whether the run completed, stopped or returned control between stages, totals the usage by role over every worker step the run has had, across every advancement:

```
Usage by role:
  proposalReviewer: 2 steps; input_tokens=33282, cached_input_tokens=0, output_tokens=118, reasoning_output_tokens=42, cost unavailable
  implementer: 3 steps, 1 without usage; input_tokens=27, cache_creation_input_tokens=90210, cache_read_input_tokens=401177, output_tokens=5120, cost $1.2034117, 1 step without cost
```

Each counter is summed by name. `without usage` counts the steps with no valid usage: a missing or empty usage file, such as after a turn stopped before its harness reported, or a malformed one, which also stopped the run. When only some of a role's steps reported a cost, the line says how many did not; when none did, the cost is unavailable.

A run accepts one advancement at a time, shared by `run`, `resume` and `step`. If the process advancing it dies, `loop resume` takes the run over and redoes the step that was in progress. A process killed with SIGKILL, for example by `kill -9` or the OOM killer, can leave its step running; `loop resume` then refuses and names the step's process group. End it with `kill -- -<group>` or wait for it to exit, then resume. If the group it names is not the run's, because its ID was reused after the step ended, check it with `pgrep -l -g <group>` and set `stepGroup` to `null` in the run directory's `state.json`.

Each run keeps its state in the repository's Git directory, at `.git/openspec-loop/<change>/` in a regular clone: `state.json` and the transcripts of every step under `transcripts/`. A run started on the default branch works in its worktree under `worktrees`. The report and `loop status` print the exact paths. To discard a run and start over, note the `Worktree` and `Run directory` lines of `loop status <change>`, then:

```sh
git worktree remove --force "<worktree>"   # only for a run started on the default branch
git branch -D loop/<change>                # likewise
rm -rf "<run directory>"
```

### Proposal review

The first stage reviews the plan: the change's proposal, design, spec deltas and tasks.

- **The review.** The proposal reviewer judges whether the whole plan can be implemented and verified as one change without asking you, and whether it keeps the decisions recorded in its design. It reports each problem as blocking or minor. A minor finding is a local fix, such as a typo or a wrong path, that cannot change behavior or a recorded decision.
- **The verdict.** It follows from the findings: any blocking finding is `REVISE`; otherwise the verdict is `APPROVE`. Each review's verdict and findings are kept as `NNN-proposal-review.verdict.json` in the transcripts.
- **Revision.** On `REVISE`, the plan reviser revises the plan in a fresh context, the loop commits the change directory on the run's branch, and the plan is reviewed again.
- **Minor fixes.** On `APPROVE` with minor findings, the plan reviser applies them, the loop commits them, and ordinary advancement starts implementation without another review; `step` returns at the proposal-review boundary.
- **Approval.** It covers the plan as it then stands. The loop does not check the plan again for edits you make: if you change it by hand while the run is stopped, the run resumes where it stopped, and verifying the edit is up to you. To have the implementer implement an edited plan after implementation completed, commit the edit on the run's branch and run `loop resume <change> --implement`: the implementer works from what the branch already holds, the checks, implementation review, integration, archival and delivery follow, and the plan is not reviewed again. Once the change is archived, `--implement` is refused.
- **Decisions.** When a finding needs a decision the plan does not record, the run stops with the reviewer's question before revising anything. Answer it by recording the decision in the design in the run's worktree, committing it on the run's branch, and running `loop resume <change>`. The report names the worktree and the branch.
- **Attempts.** Each review uses one attempt. When the last allowed review is `REVISE`, the run stops after that review's revision. Every resume starts a fresh budget; `loop resume <change> --attempts 1` gives exactly one more review.

A worker that exits nonzero, is killed, or writes a missing or malformed reply stops the run as an execution failure; the report names its transcript and reply.

### Implementation

During ordinary advancement, once the plan is approved, the implementation stage runs without you, in attempts. With `step`, it starts on the next invocation. Each attempt is one round:

- **The implementer turn.** The implementer works in a fresh context from OpenSpec's own apply instructions for the change, including any `operations.apply.guidance` in `openspec/config.yaml`, and from the findings of the last attempt. It ticks task boxes as it goes. The loop then commits everything in the run's worktree on the run's branch as `<change>: implement`, `<change>: revise implementation` or `<change>: apply minor implementation fixes`.
- **The checks.** Every required check runs, in order, even after one fails. A failed check is not a failure of the run: its exit status and the end of its output become a finding for the next attempt, kept as `NNN-checks.findings.json` in the transcripts, and review waits until the checks pass. The implementer fixes only failures the change caused, so a check that already fails on the base fails until attempts run out.
- **The review.** The implementation reviewer judges whether the patch implements the whole approved plan, stays within it and keeps the decisions in the design. The patch is the change's work outside `openspec/changes/<change>/`: plan revisions, minor plan fixes and decisions you record on the run's branch are not part of it. The verdict follows from the findings as in proposal review, and is kept as `NNN-implementation-review.verdict.json` with the base and candidate commits it covers. `REVISE` starts the next attempt on the review's findings.
- **Minor fixes.** On `APPROVE` with minor findings, the implementer applies them, the checks run again, and the stage completes without another review. If a check fails after the fixes, the approval lapses and the next attempt runs a full round.
- **Plan problems.** When the implementer reports that the plan needs a change, the plan reviser revises the plan and it returns to proposal review. Implementation continues after the plan is approved again, with the same attempt count. The implementer may tick task boxes but not change the plan itself: a turn that edits the plan otherwise stops the run, and the report names the turn's commit. Revert that commit's plan changes on the run's branch and resume. The loop compares the plan before and after each turn, so a turn interrupted before it ends is not checked.
- **Decisions.** A review finding that needs a decision the plan does not record stops the run, as in proposal review. Record the decision in the design, commit it, and resume; the plan is reviewed again first.
- **Attempts.** When the last allowed attempt ends with failed checks or `REVISE`, the run stops and names the findings. Resume starts with an implementer turn on those findings and a fresh budget, or `--attempts <n>`. A resume after a stop in the middle of an attempt also starts with an implementer turn, so a stop during checks or review costs one extra turn.

Changes outside the change's directory that you leave uncommitted in the run's worktree while the run is stopped are committed with the next implementer turn and become part of the patch. They are checked, and reviewed unless that turn applies minor fixes, which complete without another review. A run started before proposal review or implementation became real treated them as fixtures and may skip them on resume: discard such a run as described above and start it again.

### Integration

Once implementation completes, the loop integrates the change with the current base: the remote's default branch in `pr` mode, and the local default branch in `local` and `merge` modes.

- **Bringing the base in.** Every delivery mode rebases the run's branch onto the base, keeping its history linear when the rebase is clean. When the rebase conflicts, the loop abandons it and merges instead. A rebase rewrites the branch's commits, so review records and stop reports from before it name commits that are no longer on the branch; Git keeps them until it prunes unreachable objects, so `git diff` against them still works. The loop overrides `rebase.updateRefs` and `merge.ff` from your Git configuration for these commands without changing it.
- **Conflicts.** A conflicted merge stays in progress in the run's worktree, and the next attempt's implementer gets the conflicted files as a finding. The loop commits the resolution as the merge commit, with Git's message, and the checks and review run as in any attempt.
- **A changed patch.** When integration changes the change's patch, the same patch the review judged, compared without context lines or line numbers, for example because the base already holds part of the change, the result goes back to the implementer the same way and is checked and reviewed again.
- **Checks.** The required checks run on the integrated result, and a failure goes back to the implementer as a finding. Each return to the implementer uses an implementation attempt.
- **The default branch in `merge` mode.** The loop first fetches the upstream and brings the local default branch level with it. When it is behind, the loop fast-forwards it in the checkout that holds it, and stops if that checkout has uncommitted changes to tracked files; untracked files do not count. When the local default branch is ahead of its upstream, or the two have diverged, the run stops: push or remove the extra commits, or reconcile the branches, then run `loop resume <change>`. A proposal commit left unpushed on the default branch stops the run this way, so in `merge` mode push the proposal before `loop run`, or propose on a branch of its own.
- **Unpushed commits in `pr` mode.** The base is the remote's branch, so commits on your local default branch that are not pushed become part of the pull request. Push them first if they should not.
- **Already-pushed branches in `pr` mode.** Enrollment accepts a branch you have already pushed. The same rebase rule applies, so its later non-force delivery push can be rejected.
- **Interruptions.** A rebase or merge that a stop or crash left in progress before its conflict reached the implementer is aborted when integration runs again.

### Archive

After integration, the loop archives the change by running `openspec archive <change> --yes` in the run's worktree. OpenSpec validates the change, applies its spec deltas to the main specs under `openspec/specs/`, and moves the change to `openspec/changes/archive/<date>-<change>/`. The loop commits the result on the run's branch as `<change>: archive`. OpenSpec's output is kept as `NNN-archive.log` in the transcripts.

When OpenSpec refuses, for example because a spec delta fails validation or names a requirement the main spec lacks, the run stops at archive and commits nothing; the report names the transcript. Fix the change in the run's worktree, commit the fix on the run's branch, and run `loop resume <change>`. Resume runs the archive again without reviewing the fix.

If a run is stopped or dies after OpenSpec archived the change, resume sees that the change has left `openspec/changes/<change>/`, does not run OpenSpec again, and commits the archive if the loop had not yet. Only an interruption inside `openspec archive` itself can leave its work half done, with the change still in place; resume then fails with OpenSpec's message. Undo the partial archive in the run's worktree with `git restore --source=HEAD --staged --worktree openspec` and `git clean -fd openspec/changes/archive`, then resume.

### Delivery

The last stage delivers the archived change as `delivery` says. Every action outside the run's worktree gets its own progress line, and the output of each fetch, push and `gh` command is kept in the transcripts.

- **`local`.** Nothing is pushed and the default branch is untouched. The run ends with the archived change committed on the run's branch.
- **`pr`.** Only at delivery, after integration and archival, the loop pushes the run's branch to the upstream remote without force or setting an upstream for it, and opens a pull request with `gh` against the upstream branch, on the upstream remote's repository. The pull request is titled with the change's name, and its body is the archived proposal. The local default branch is untouched. A rejected push stops delivery with Git's message and transcript before any pull request command. `gh` must be installed and logged in; if it is missing or fails, the run stops at delivery, and `loop resume <change>` continues after the push it already made.
- **`merge`.** The loop first checks that the checkout holding the default branch has no uncommitted changes to tracked files and that the run's branch contains the default branch. It then pushes the run's branch tip to the upstream branch and only then fast-forwards the local default branch to it, so a rejected push leaves the local default branch where it was. The fast-forward moves the files of the checkout that holds the default branch, and stops rather than overwrite a file there, ignored files included.

When delivery stops, the report says what to fix:

- **A dirty checkout:** commit or discard its changes, then resume.
- **Commits on the default branch that the run's branch lacks, or a rejected push because the upstream moved:** bring them into the run's branch in its worktree, then resume.
- **A rejected PR branch push after rebasing:** reconcile the run's branch with its published history in the run's worktree, then run `loop resume <change>` or `loop step <change>`. Continuation retries delivery without repeating completed integration, checks, review or archival; checking the reconciliation is your responsibility.
- **A failed fast-forward:** clear what Git names in the checkout, such as a file in the way, then resume.

Resume after an interrupted delivery repeats its steps safely. Git does nothing for a push or a fast-forward whose commit is already there, and in `pr` mode the loop reports a pull request that is already open for the run's branch against the upstream branch instead of opening another.

## Supervising from Claude Code or Codex

The skill you copied in Setting up a project lets a Claude Code or Codex session drive the loop for you. Ask the session to run, stop or resume a change. It gives the same `loop` commands you would, relays each progress line as it is printed, and shows the report unchanged. When a run stops, it diagnoses the stop with you from the report, the transcripts, the agent's configured command and the findings, changes nothing while it does, and repairs or resumes only when you agree.

`loop` writes the repository's Git directory and starts its own workers, so the session runs it outside its sandbox. In Codex, approve the escalated permissions the session requests for each `loop` command.

## Development

```sh
npm ci      # install the pinned dev dependencies
npm test    # build and run the tests; this is the project's only check
```

The loop's contract is `openspec/specs/loop-workflow/spec.md`.

### Releasing

On the branch of the change that releases, set the version and commit `package.json` and `package-lock.json` with it:

```sh
npm version <version> --no-git-tag-version
```

After that change merges, release from a worktree detached at the default branch's tip:

```sh
npm ci
npm test                                   # also builds dist/src, which the package ships
npm pack
npm publish openspec-loop-<version>.tgz
git tag v<version>
git push origin v<version>
npm install -g openspec-loop@<version>
```

Then check that `loop status <any name>` refuses for a missing run and that the skill is under `$(npm root -g)/openspec-loop/skills/`.
