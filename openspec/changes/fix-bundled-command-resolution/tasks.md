# Tasks

## 1. Make sibling commands available

- [ ] 1.1 Append the invoked CLI directory to PATH before command dispatch in `src/cli.ts`; add focused CLI regressions launching an npm-style `loop` symlink from a linked worktree with its bin directory omitted from PATH, verifying worker execution and retained precedence for an earlier PATH command. Verify the focused tests pass and keep role resolution, worker launching and jail code unchanged.
- [ ] 1.2 Document the appended launch directory and continued external prerequisites in README.md; verify the description matches the CLI tests and retains the existing per-adapter ai-jail guidance.

## 2. Validate integration

- [ ] 2.1 Run `npm test` and `openspec validate fix-bundled-command-resolution --strict`; verify both pass, including existing jail coverage, and confirm the patch adds no resolver, configuration option, adapter rewrite or sandbox mapping mechanism.
