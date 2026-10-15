# Design

## Context

`loop-jail` (`src/jail.ts`) runs `ai-jail --exec --network --no-save-config`, its maps, then `--` and the wrapped command. It creates its relay directory with Node's `tmpdir()` on the host, before ai-jail starts. The README tells users to extend the jail with `[commands.<adapter>]` tables in `~/.ai-jail`.

Verified with ai-jail 2.2.0 on Linux while preparing this change:

- ai-jail passes `TMPDIR` into the jail. With `TMPDIR` set to a host directory the jail does not contain, `mktemp` inside fails with "No such file or directory".
- `--env TMPDIR=/tmp` sets the variable inside the jail only: `mktemp` there creates `/tmp/tmp.*`. ai-jail itself keeps using the host `TMPDIR`; it fails to start when that names a missing directory.
- ai-jail merges the top-level keys of `~/.ai-jail` with the `[commands.<name>]` table of the command run, so top-level keys apply to every command (`src/config.rs:813-825` in ai-jail 2.2.0). With only top-level `ro_maps` for `~/.cargo/bin` and `~/.rustup`, `rw_maps` for a target directory and `env_pass` for `CARGO_TARGET_DIR` and `RUSTUP_HOME`, a command with no table of its own ran `cargo --version` and wrote to the target directory.

## Goals / Non-Goals

**Goals:**

- Temporary files work inside the jail whatever the caller's `TMPDIR`.
- One documented place to give every adapter a project's toolchain and build environment.

**Non-Goals:**

- A jail section in the loop's configuration (#85, option 1). The toolchain's location, such as `~/.cargo` or `/home/linuxbrew`, belongs to the machine, so the committed `loop.yaml` cannot name it portably; it would land in `loop.local.yaml`, which is as machine-local as `~/.ai-jail` and adds a configuration surface to the loop. This keeps `worker-jail`'s D1.
- Mapping the caller's PATH or toolchain directories automatically. A toolchain needs more than its PATH entry, such as `~/.rustup`, a writable registry and build variables; guessing them is the per-user setup ai-jail's configuration already expresses.

## Decisions

**D1. `--env TMPDIR=/tmp` on every run.** The wrapper adds it to ai-jail's arguments unconditionally, so the worker's temporary files land in the jail's private `/tmp`. Dropping `TMPDIR` from the wrapper's own environment instead was rejected: it would change where ai-jail and the relay directory live on the host, and whether ai-jail then leaves the variable unset inside the jail was not verified.

**D2. The README documents top-level `~/.ai-jail` keys.** The extension paragraph tells users to put what every worker needs, such as a toolchain and its build variables, at the top level of `~/.ai-jail`, and to keep `[commands.<adapter>]` tables for one harness's needs, such as a provider key. It shows a Rust example: `ro_maps` for `~/.cargo/bin` and `~/.rustup`, `rw_maps` for `~/.cargo/registry` and a shared target directory, and `env_pass` for `CARGO_TARGET_DIR`. A writable registry map, not an overlay map, because ai-jail puts an overlay's upper layer in the worktree.

## Risks / Trade-offs

- [A worker can write the shared registry and target directory] → They are the user's choice in `~/.ai-jail`; the jail prevents accidents, not sabotage.
- [A future ai-jail stops merging top-level keys into command tables] → The README names the verified ai-jail version.
