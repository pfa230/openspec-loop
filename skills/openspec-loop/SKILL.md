---
name: openspec-loop
description: Supervise an openspec-loop run of a committed OpenSpec change. Use when the user asks to run, watch, stop or resume a change with the loop, or asks what a loop run is doing.
---

# Supervise an openspec-loop run

The loop runs a committed OpenSpec change unattended. You supervise it only through its four commands, exactly as a person at a terminal would:

- `loop run <change>` starts a run and advances it in the foreground. It prints a progress line, prefixed with the time, as each step starts and ends, then a report. It exits 0 when the run completes, 1 when it stops, and 2 when it refuses to start.
- `loop status <change>` shows the run's state, branch, stages and locations.
- `loop stop <change>` ends the current step at once; the running `loop run` then prints its stop report.
- `loop resume <change>` continues a stopped or interrupted run with a fresh attempt budget; `loop resume <change> --attempts <n>` sets that budget. It advances in the foreground like `loop run`, with the same output and exit statuses.

## Rules

- Run every `loop` command outside your sandbox. The loop writes the repository's Git directory, which sandboxes make read-only, and it starts its own workers. In a Codex session, request escalated permissions for each `loop` command.
- Relay each progress line to the user as it appears, in order and unchanged. Do not batch them until the run ends.
- When the command exits, show the user the report. On a stop, name the stopped stage, the cause and the recovery the report gives, and say where the transcripts are.
- Run `loop stop` only when the user asks. Run `loop resume` only after the user agrees, even when the report names it as the recovery.
- Do not edit the run's state, worktree or transcripts, and do not investigate a failure by changing anything. Read the report, `loop status` and the transcripts, and tell the user what they show. The one exception is answering a decision stop, below, and only with the user's agreement.

## Watching a run in Claude Code

1. Start the command with Bash and `run_in_background: true`, redirecting its output to a log file: `loop run <change> > <log> 2>&1`. Use `loop resume <change>` the same way.
2. Start a Monitor on `tail -n +1 -f <log>` with the longest timeout. Each new line arrives as a notification; relay it, and keep count of the lines relayed. If the monitor expires while the run continues, re-arm it with `tail -n +<count + 1> -f <log>`, so no line is skipped or repeated.
3. When Bash reports that the background command exited, stop the monitor, read the log from the first line not yet relayed to the end, and give the user those lines, the report and the exit status.

## Watching a run in Codex

Verified with Codex CLI 0.160.0. Start the command with `exec_command` and a short `yield_time_ms` such as 1000. While the command runs, the call returns the lines printed so far and a session id. Poll that session with `write_stdin`, passing empty `chars`, and relay the new lines from each poll. The poll that returns the exit status also carries the report.

## Stopping and resuming

To stop, run `loop stop <change>` from any checkout of the repository; the watched `loop run` prints the stop report and exits 1. To continue after the user agrees, start `loop resume <change>` and watch it the same way. If `loop status` shows the run as interrupted, the process advancing it died; `loop resume` takes the run over and redoes the interrupted step.

## Answering a decision stop

When the report's cause says a review needs decisions the plan does not record, show the user each question exactly as the report lists it. The questions are the user's to answer; do not answer them yourself. When the user has answered, offer to record the answers. With the user's agreement, write each decision into the change's `design.md` in the run's worktree that the report's recovery names, and commit it there on the run's branch with `git commit`. Then resume with `loop resume <change>` once the user agrees, and watch the run as before. The resumed run reviews the plan again.
