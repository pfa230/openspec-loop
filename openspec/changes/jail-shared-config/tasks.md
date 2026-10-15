# Tasks

## 1. Wrapper

- [ ] 1.1 In `src/jail.ts`, pass `--env TMPDIR=/tmp` to ai-jail before `--` (D1). In `test/jail.test.ts`, assert in the existing reply-and-usage test that the stub received `--env TMPDIR=/tmp`. Run `npm test` and verify it passes

## 2. Documentation

- [ ] 2.1 In the README's sandboxing section, state that `TMPDIR` inside the jail is `/tmp`, and replace the extension paragraph as D2 describes, with the Rust example as a `~/.ai-jail` code block. Verify the example's keys against ai-jail 2.2.0's README

## 3. End-to-end check

- [ ] 3.1 With ai-jail installed, run the built `loop-jail` in a scratch repository's linked worktree with `TMPDIR` set to a host directory and a stub worker that runs `mktemp` and writes its reply. Verify `mktemp` creates its file under `/tmp` and the reply arrives
