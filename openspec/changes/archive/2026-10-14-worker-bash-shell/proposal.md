# Proposal

## Why

A worker's harness runs model-written commands in a shell it picks, and Claude Code and OpenCode pick the shell named by the inherited `SHELL`. On a host whose `SHELL` is zsh, a bash-shaped command such as `echo ===` fails (`zsh:1: == not found`). A MiMo implementer under OpenCode reran that failing command until OpenCode's repeated-call guard asked for permission, the adapter rejected it as the contract requires, and the run stopped. Models write bash, so workers should get bash regardless of the operator's interactive shell.

## What Changes

- The loop runs every worker command with `SHELL` set to `bash`, whatever the harness.
- A harness's own shell setting still applies: OpenCode's `shell` configuration and Claude Code's `CLAUDE_CODE_SHELL` take precedence over `SHELL`.
- The README lists bash as a prerequisite and states, per harness, whether `SHELL` decides its shell. Codex reads the account's login shell instead of `SHELL`, and Antigravity used bash regardless of it.
- Checks, archival and other loop-run commands keep the loop's environment unchanged; only workers run model-written commands.
- The OpenCode adapter's permission handling does not change. OpenCode 1.18.34 halts the session on any rejection of its repeated-call guard, and approval disables the guard, so rejection remains the behavior that stops a stuck model.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: the Worker interface requirement adds the worker's `SHELL` environment.

## Impact

- `src/step.ts`: `startWorker` sets `SHELL` for the worker process; `runStep` accepts the environment.
- `test/worker.test.ts`, `test/helpers.ts`: the stub worker records its `SHELL`.
- `README.md`: prerequisites and the agents section.
