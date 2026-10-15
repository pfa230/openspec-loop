# Tasks

## 1. Worker shell

- [x] 1.1 Give `runStep` in `src/step.ts` an `env` parameter defaulting to `process.env`, and have `startWorker` run the worker with `{ ...process.env, SHELL: "bash" }`
- [x] 1.2 Have the stub worker in `test/helpers.ts` record its `SHELL`, and add one test in `test/worker.test.ts`: with an inherited `SHELL` naming zsh, the worker records `SHELL` as `bash`
- [x] 1.3 Run `npm test` and verify it passes

## 2. Documentation

- [x] 2.1 Add bash to the README prerequisites, and state in the agents section that workers run with `SHELL` set to `bash`, that OpenCode's `shell` setting and Claude Code's `CLAUDE_CODE_SHELL` take precedence, and that Codex uses the account's login shell and Antigravity ignores `SHELL`
