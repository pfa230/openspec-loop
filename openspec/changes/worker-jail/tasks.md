# Tasks

## 1. Wrapper

- [ ] 1.1 Add `src/jail.ts` as the `loop-jail` bin (D1, D2, D6): require a command followed by the four worker paths, run `ai-jail --exec --network --no-save-config`, the maps of 1.2-1.4, then `--` and the wrapped command with inherited standard streams, and exit with its status, or 1 when it ends by a signal; a spawn failure names `ai-jail`. Register the bin in `package.json` and verify `npm run build` emits `dist/src/jail.js`
- [ ] 1.2 Map the Git common directory and the worktree's `.git` file read-only, and relay reply and usage through a host temporary directory mapped writable (D3): substitute the last two arguments, copy each file that exists to the loop's paths after exit whatever the status, and remove the directory. Verify with the tests in 1.5
- [ ] 1.3 Map read-only each symlink hop's directory and the final directory, or npm package directory under `node_modules`, for the wrapped command, its harness and `openspec` (D4). Verify with the tests in 1.5
- [ ] 1.4 Share the harness files in D5's table for the four shipped adapters. Verify with the tests in 1.5
- [ ] 1.5 Add `test/jail.test.ts` with a stub `ai-jail` on PATH that records its arguments and runs the command after `--`, and a stub worker that writes its reply and usage: one test that a worker's reply and usage reach the loop's paths, the Git directory, `.git` file and command chain are mapped read-only, and status 3 passes through with the files still delivered; one test that `loop-claude` shares its credential file writable and its settings and instructions read-only; one test that a missing `ai-jail` fails naming it. Run `npm test` and verify it passes

## 2. Documentation

- [ ] 2.1 In the README, add ai-jail as a prerequisite for `loop-jail` only, name `loop-jail` among the installed commands, and replace the sandbox example in the agents section with a sandboxing section: the agent prefix, what the worker can and cannot write, the harness files shared per adapter, extending through `[commands.<adapter>]` in `~/.ai-jail`, Chrome's `--no-sandbox`, and what the jail does not protect (credentials on an open network, checks run on the host). Verify each documented agent command matches the bin and arguments in 1.1

## 3. End-to-end check

- [ ] 3.1 With ai-jail installed, run `loop-jail` on a stub worker script in a scratch repository's linked worktree and verify that the reply and usage arrive, that writes to the Git directory's hooks and configuration, the worktree's `.git` file and a file in the home directory do not reach the host, and that no `.ai-jail` file appears in the worktree
- [ ] 3.2 With ai-jail installed and the harnesses logged in, run one worker step each through `loop-jail` with `loop-claude`, `loop-codex -s read-only`, `loop-agy --dangerously-skip-permissions` and `loop-opencode --auto`, prompting each to run `git status` and `openspec --version`, and verify each reply reaches its reply path
