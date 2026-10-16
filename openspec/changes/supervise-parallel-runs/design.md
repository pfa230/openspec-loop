# Design

## Context

Runs of different changes already share no state: each has its own run directory, lock, transcripts and, when enrolled from the default branch, its own `loop/<change>` branch and worktree. The OpenCode adapter takes a free port and the jail wrapper takes a private temporary directory, so workers of different runs do not collide. The CLI therefore already supports several runs at once. The gap is in the supervision skill, which watches one run, and in the loop's progress lines, which do not name their change.

## Goals / Non-Goals

**Goals:**
- One supervising session starts and watches several runs at once, and reports on each of them.

**Non-Goals:**
- See the proposal's non-goals. The design adds no code.

## Decisions

### The batch lives in the supervision skill (user decision)

The user chose to have the supervisor run and supervise every change. The alternatives were a CLI batch command, which would add a command, a combined report and possibly batch state, and a documented shell loop, which gives neither labeled progress nor diagnosis.

### Runs start in parallel from the default branch (user decision)

The skill starts a batch only when the invoking checkout is on the configured default branch, where `loop run <change>` creates each change's own branch and worktree, so the runs share no files or branch. On any other branch enrollment would reuse the invoking worktree for every run, so the skill refuses the batch, names the branch and the default branch, and starts no run. It starts `loop run <change>` for every change it runs without waiting for one to end. Twelve concurrent `git worktree add -b` calls against one repository all succeeded in a local test, so the runs need no staggered start.

### Explicit list, in the order given (user decision)

Only the changes the user names are run, matching the contract's explicit enrollment. Since every run starts at once, the order only sets the order of the final summary.

### One run's end does not affect the others (user decision)

A run that completes, stops or is refused gets the single-run handling: its report unchanged, a diagnosis for a stop, and a resume only after the user agrees. Meanwhile the skill keeps relaying the other runs. A run the user resumes is watched alongside the rest.

### Labeled relay, one watcher per run (default)

Each run writes its own log. In Claude Code the skill starts one background command and one Monitor per run, keeps a relayed-line count per run for re-arming, and forwards each line as `<change>: <line>`. In Codex it starts one `exec_command` session per run and polls each in turn. The label is the only change to a forwarded line, and reports are still shown unchanged.

### Summary when the last run ends (default)

The summary lists one line per change it ran, in the order the user named them: `completed`, `stopped at <stage>` or `refused`, as that run's report states it. Each run's report and diagnosis were already shown when the run ended, so the summary repeats neither.

### Dependency check before start (user decision)

The skill reads each named change's proposal, design and tasks for work the change needs, such as a requirement, file, command or change it names, and checks whether the default branch holds it, from the main spec, the archived changes and the default branch's files. Another named change counts as unlanded, because parallel runs do not see each other's work. For each change that needs unlanded work, the skill names the missing work and the evidence by file and line, proposes dropping the change and waits for the user's list of changes to run. With nothing flagged, it starts at once. Only direct dependencies are checked: the skill builds no dependency tree and does not order changes. The alternatives were no check and a full tree with ordering; the user asked for the check without the tree.

### No concurrency limit (default)

Every change to run starts at once. Provider rate limits that this triggers surface as ordinary execution failures, which the skill diagnoses as usual.

### Merge-mode collisions use the existing stops (default)

In `merge` mode two runs deliver to the same default branch. When one delivers while another sits between integration and delivery, the later run's delivery finds commits it lacks, or its push is rejected, and the run stops with the existing cause and recovery. The skill diagnoses that stop like any other. In `pr` and `local` modes the runs touch no shared branch. The controller does not change.

## Risks / Trade-offs

- [The batch depends on a live session] → Each change is an ordinary run: `loop status` and `loop resume` work without the session, and a session that dies leaves every run recoverable.
- [The check is a judgment from plan text, so it can miss a dependency or flag a false one] → The user confirms the list, and a missed dependency surfaces as a failing check or review in that run, which the skill diagnoses.
- [Merge-mode runs that end close together stop at delivery] → The stop names its recovery. Its likelihood grows with the number of runs, and the skill's summary shows which runs need it.
