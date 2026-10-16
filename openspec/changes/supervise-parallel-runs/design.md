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

### Runs start in parallel, each in its own worktree (user decision)

The skill starts `loop run <change>` for every named change from the invoking checkout, without waiting for one to end. Enrollment from the default branch already gives each change its own branch and worktree. Twelve concurrent `git worktree add -b` calls against one repository all succeeded in a local test, so the runs need no staggered start.

### Explicit list, in the order given (user decision)

Only the changes the user names are run, matching the contract's explicit enrollment. Since every run starts at once, the order only sets the order of the final summary.

### One run's end does not affect the others (user decision)

A run that completes, stops or is refused gets the single-run handling: its report unchanged, a diagnosis for a stop, and a resume only after the user agrees. Meanwhile the skill keeps relaying the other runs. A run the user resumes is watched alongside the rest.

### Labeled relay, one watcher per run (default)

Each run writes its own log. In Claude Code the skill starts one background command and one Monitor per run, keeps a relayed-line count per run for re-arming, and forwards each line as `<change>: <line>`. In Codex it starts one `exec_command` session per run and polls each in turn. The label is the only change to a forwarded line, and reports are still shown unchanged.

### Summary when the last run ends (default)

The summary lists one line per change, in the order the user named them: `completed`, `stopped at <stage>` or `refused`, as that run's report states it. Each run's report and diagnosis were already shown when the run ended, so the summary repeats neither.

### No dependency handling and no concurrency limit (default)

The user lists changes that can run independently. A change that needs another's work runs after that work lands. Every named change starts at once. Provider rate limits that this triggers surface as ordinary execution failures, which the skill diagnoses as usual.

### Merge-mode collisions use the existing stops (default)

In `merge` mode two runs deliver to the same default branch. When one delivers while another sits between integration and delivery, the later run's delivery finds commits it lacks, or its push is rejected, and the run stops with the existing cause and recovery. The skill diagnoses that stop like any other. In `pr` and `local` modes the runs touch no shared branch. The controller does not change.

## Risks / Trade-offs

- [The batch depends on a live session] → Each change is an ordinary run: `loop status` and `loop resume` work without the session, and a session that dies leaves every run recoverable.
- [Merge-mode runs that end close together stop at delivery] → The stop names its recovery. Its likelihood grows with the number of runs, and the skill's summary shows which runs need it.
