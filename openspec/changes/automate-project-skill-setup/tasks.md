# Tasks

## 1. Project skill setup

- [ ] 1.1 Add `loop setup` dispatch and a small setup operation using `topLevel` and the executing package's bundled skills. Install every bundled directory for both Claude Code and Codex without loading loop configuration. Add CLI/filesystem tests that verify installed contents, no-argument syntax, subdirectory and linked-worktree targeting, and setup without an OpenSpec root, loop configuration or worker executables. Document the command in the README's project setup section. Verify with those tests and the observed destination paths.
- [ ] 1.2 Implement replacement of existing bundled skill directories while preserving unrelated skills and project files. Add tests for stale supervision copies, missing scoping copies, obsolete bundled files, overwritten local edits, repeat setup and unchanged configuration/Git state. Replace the README's manual refresh instructions with `loop setup` after upgrades and explain package ownership of its destination directories. Verify the tests compare actual file contents and the README no longer requires copying skills manually.
- [ ] 1.3 Implement prerequisite and destination-path refusals before writes, including files and symlinks, using exit 2; report actual source/copy failures with exit 1 and their paths. Add tests proving refused invocations leave both tool directories and linked targets unchanged, and a relocated-package fixture with a missing source reports the failing path. Document failure reporting and explicit rerun after repair. Verify these tests and existing CLI refusal tests pass without adding a runtime fault-injection option.

## 2. Package integration

- [ ] 2.1 Add a relocated-package test whose bundled skills differ from the invoking repository's contents and whose npm prefix points elsewhere. Verify setup installs the executing package's exact contents; keep it under `npm test` so wrong package-relative resolution fails the required check.
- [ ] 2.2 Run `npm test` and `openspec validate automate-project-skill-setup --strict --no-interactive`. Review the final diff to confirm that only the setup operation, its CLI dispatch, required tests, README procedure and OpenSpec artifacts changed; verify no live package or Labeler files were altered.
