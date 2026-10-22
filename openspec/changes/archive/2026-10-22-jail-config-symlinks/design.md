# Design

## Context

`src/jail.ts` builds its read-only map list from the Git metadata, the directories that make each executable runnable, and each shipped harness's `readOnly` paths under the home directory. Only `loop-opencode` lists a directory there, `~/.config/opencode`; the other harnesses list single files. ai-jail 2.2.0 follows a symlink given as a map path, so a symlinked single file such as `~/.claude/CLAUDE.md` is readable in the jail, but it does not follow links inside a mapped directory. See proposal.md for the failure.

## Goals / Non-Goals

**Goals:**

- A symlink directly inside a read-only configuration directory reads in the jail as it does on the host, and stays read-only.

**Non-Goals:**

- Links nested deeper inside the directory. No setup observed links below the top level.

## Decisions

**Map the target of every top-level symlink in each read-only directory.** After adding the harness's `readOnly` paths, the wrapper reads each one that is a directory and, for every entry that is a symlink, adds its target, resolved against the directory, to the read-only maps. A path that is not a directory, or does not exist, adds nothing. A run of ai-jail 2.2.0 mapping `~/.config/opencode` together with the targets of its `opencode.jsonc` and `AGENTS.md` links read both files through the links, and writing `opencode.jsonc` failed with "Read-only file system". The rule keys on the path being a directory, not on the adapter's name.

**Map the link's own target, not its final resolution.** The wrapper maps `readlink`'s target as written, resolved to an absolute path. When that target is itself a link, ai-jail follows it as it already does for a symlinked single-file map, so the chain needs no walking. Alternative: `realpath` of each link. The path inside the jail would then not exist at the location the link names.

**Map every link's target, including one that points back inside the directory.** Such a target is already visible through the directory map, so mapping it again changes nothing. Alternative: skip links whose target lies inside the directory. It adds a condition that changes no outcome.

**Pass a dangling link's target through unchanged.** ai-jail 2.2.0 ignores a read-only map whose path does not exist, as it does today for a harness file the host lacks, so the link stays dangling in the jail as on the host.
