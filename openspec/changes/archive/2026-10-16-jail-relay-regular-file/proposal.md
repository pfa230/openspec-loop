# Proposal

## Why

A jailed worker can read any host file the loop's user can read, which defeats the jail (issue #91). After the worker exits, `loop-jail` copies the relayed reply and usage on the host with `copyFileSync`, which follows symlinks, and the worker controls the relay directory. A worker that replaces its reply with a symlink to a host file gets that file copied into the run directory, which every later jailed worker can read. A relayed FIFO hangs the wrapper, because opening a FIFO for reading blocks until a writer appears.

## What Changes

- `loop-jail` delivers a relayed reply or usage only when it is a regular file, read without following a symlink.
- A relayed file that exists but is not a regular file (a symlink, FIFO, directory or other non-regular file) is not copied, and the wrapper fails with an error naming it, whatever the wrapped command's status.
- A missing relayed file keeps today's behavior: nothing is copied.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: the "Sandboxed repository metadata" requirement limits reply and usage delivery to regular files and makes a non-regular relayed file a wrapper failure.

## Impact

- `src/jail.ts`: the relay copy after the worker exits.
- `test/jail.test.ts`: one test for a refused relayed file.
- `README.md`: the Sandboxing section's description of the relay.
