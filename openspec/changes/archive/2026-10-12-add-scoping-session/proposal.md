# Proposal

## Why

Proposing several issues currently repeats worktree setup and leaves the default checkout dirty when proposals are authored there, blocking concurrent merge delivery. Issue [#14](https://github.com/pfa230/openspec-loop/issues/14) requests an attended scoping session that prepares small, decided, individually committed proposals and lands them together.

## What Changes

- Add `loop scope start <session>` to create a proposal worktree on its own branch from the configured local default branch, and `loop scope finish <session>` to rebase and deliver its committed proposals using the configured delivery mode.
- Define proposal-session delivery explicitly: `local` fast-forwards the local default branch without contacting a remote; `pr` publishes the session branch and opens or finds one proposal pull request; `merge` pushes to the upstream default branch before fast-forwarding the local one. Qualify the existing delivery and integration requirements as run-specific while retaining their behavior.
- Ship a thin `openspec-scope` skill for Claude Code and Codex that follows repository instructions when ranking open issues, lets the user select issues, invokes native OpenSpec proposing, settles or records design defaults, trims scope, and commits each finished proposal separately with its source issue.
- Keep interrupted work in the same worktree and Git history; finish requires committed, clean session work and reports failures for attended recovery. A rejected PR retry after rebasing a published branch requires merging the current base with its published history before retrying. Finish neither starts a run nor implements or archives the proposed changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: Add attended scoping-session commands, proposal delivery and skill requirements alongside the existing attended-proposal and single-change-run contract.

## Impact

- Extend CLI dispatch in `src/cli.ts`; add session operations in `src/scope.ts` using existing configuration and Git helpers. Share existing default-branch checks and fast-forward behavior with `src/controller.ts` only where needed to avoid duplication, preserving the checked default tip when updating an unchecked-out branch.
- Add `skills/openspec-scope/SKILL.md` and update README setup and proposal guidance. The package already ships the `skills` directory.
- Extend CLI tests and add session tests using the existing temporary-repository and GitHub stubs; retain all run-delivery regression tests.
- No new dependency, configuration key, run stage or session-state file.

## Non-goals

- Running multiple changes unattended (#13), implementing changes during scoping, automated proposal review, or replacing native OpenSpec proposing.
- Enforcing a proposal format with hooks, parsing decisions in the deterministic commands, or checking hand-authored plans at finish.
- Session cleanup commands, automatic conflict resolution, force pushes, or closing source issues when proposals are published.
