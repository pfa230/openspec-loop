# Tasks

## 1. Make sibling commands available

- [x] 1.1 Append the invoked CLI directory to PATH before command dispatch in `src/cli.ts`; add focused CLI regressions launching an npm-style `loop` symlink from a linked worktree with its bin directory omitted from PATH, verifying worker execution and retained precedence for an earlier PATH command; also launch the symlinked `loop` with PATH removed from the environment and assert that a sibling command is still found. Verify the focused tests pass and keep role resolution, worker launching and jail code unchanged.
- [x] 1.2 Document the appended launch directory and continued external prerequisites in README.md; verify the description matches the CLI tests and retains the existing per-adapter ai-jail guidance.

## 2. Validate integration

- [x] 2.1 Run `npm test` and `openspec validate fix-bundled-command-resolution --strict`; verify both pass, note that the wrapped-adapter scenario holds because role resolution, worker launching and jail code remain unchanged and workers inherit `process.env`, and confirm the patch adds no resolver, configuration option, adapter rewrite or sandbox mapping mechanism.
