# Design

## Context

`src/jail.ts` hands the wrapped command two paths in a host temporary directory mapped writable into the jail, and after ai-jail exits it copies each existing one with `copyFileSync` to the loop's reply and usage paths, then removes the directory. The copy runs on the host with the loop user's permissions, and the worker chooses what each relayed path is. See proposal.md for the exploit.

## Goals / Non-Goals

**Goals:**

- Copy only a regular file's contents, and refuse every other kind of file without blocking on it.

**Non-Goals:**

- Limiting the size of a relayed regular file. The worker can already fill the writable worktree.
- Changing the relay directory, its location, or its cleanup.

## Decisions

**Check each relayed path with `lstat` before copying it.** The wrapper calls `lstatSync` on each relayed path once ai-jail has exited. `ENOENT` means nothing was relayed and nothing is copied, as today. A regular file is copied with `copyFileSync` as today. Anything else, including a symlink, FIFO or directory, is refused without being opened, so a FIFO cannot block the wrapper; a run of `node -e` confirmed that `openSync` on a FIFO with no writer blocks (killed by `timeout` after 2 seconds). Any other `lstat` error propagates and fails the wrapper. The path cannot change between the check and the copy, because no jailed process outlives ai-jail: in a run of ai-jail 2.2.0, a `setsid` background process that was to write a mapped file 3 seconds later never wrote it, and no process remained. Alternative: open with `O_NOFOLLOW | O_NONBLOCK` and check and read the descriptor. It closes a check-to-copy window that no run produces.

**Copy every regular file, then fail naming each refused one.** Each relayed path is handled on its own: a regular file is delivered, a refused file is recorded. After the relay directory is removed, any refusal fails the wrapper through the existing `fail` helper with an error naming the refused files. A refused file therefore never reaches the run directory, and the delivered usage of a step whose reply was refused stays in its report. Alternative: stop at the first refused file. It would drop a valid usage file whenever the reply is refused.

