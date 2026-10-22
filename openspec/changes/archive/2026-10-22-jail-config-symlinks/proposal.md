# Proposal

## Why

A jailed `loop-opencode` worker runs without the user's OpenCode configuration when that configuration is a symlink, which is how dotfiles setups keep it. `loop-jail` maps `~/.config/opencode` read-only as a directory, but a link inside it that points elsewhere, such as `opencode.jsonc -> ~/dotfiles/opencode/opencode.jsonc`, resolves to nothing in the jail. Running ai-jail 2.2.0 with that map, reading `~/.config/opencode/opencode.jsonc` fails with "No such file or directory", and `AGENTS.md`, linked the same way, is missing too. OpenCode then starts on its defaults without any error, so provider endpoint pins, the small model and global instructions silently do not apply. The "Sandboxed harness files" requirement already says the harness runs with the user's configuration; this change makes `loop-jail` meet it.

## What Changes

- For each read-only harness configuration path that is a directory, `loop-jail` also maps read-only the target of every symlink directly inside it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The "Sandboxed harness files" requirement already shares the harness's user configuration read-only and has the harness run with it; the jail fails that for a symlinked file, and this change makes it hold. The change sets `skip_specs: true`.

## Impact

- `src/jail.ts`: the read-only map list.
- `test/jail.test.ts`: one test for a symlinked OpenCode configuration file.
