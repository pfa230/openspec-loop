# Proposal

## Why

Issue #85: a worker under `loop-jail` cannot build or test what the checks run. Two causes. ai-jail passes the caller's `TMPDIR`, which names a host directory the jail does not contain, so `mktemp` inside the jail fails with "No such file or directory". And the README tells users to extend the jail per adapter, through `[commands.<adapter>]` tables in `~/.ai-jail`, so a toolchain under the home directory, such as Rust in `~/.cargo` and `~/.rustup`, must be repeated for each of the four adapters. ai-jail already applies the top-level keys of `~/.ai-jail` to every command, which covers every adapter at once; the README does not say so.

## What Changes

- `loop-jail` sets `TMPDIR` to `/tmp` inside the jail, so temporary files land in the jail's private `/tmp`.
- The README tells users to extend the jail through top-level keys of `~/.ai-jail`, which apply to every adapter, with a Rust example: `ro_maps` for the toolchain, `rw_maps` for a shared target directory, and `env_pass` for build variables such as `CARGO_TARGET_DIR`. Per-adapter tables remain for what one harness alone needs, such as a provider key.
- No jail section in the loop's configuration: the toolchain's location is a property of the machine, which `~/.ai-jail` already holds, not of the project.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: the Shipped sandbox wrapper requirement gains a working `TMPDIR` inside the jail.

## Impact

- `src/jail.ts`: one ai-jail argument.
- `test/jail.test.ts`: one assertion in the existing wrapper test.
- `README.md`: the sandboxing section's extension paragraph.
- Addresses #85.
