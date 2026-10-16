# Tasks

## 1. Regular-file relay

- [ ] 1.1 In `src/jail.ts`, replace the `existsSync` check before the relay copy with the `lstatSync` check from design.md: treat `ENOENT` as nothing relayed, copy a regular file with `copyFileSync`, record any other kind of file as refused without opening it, and after removing the relay directory, fail with an error naming each refused file. Verify the existing `test/jail.test.ts` tests still pass.
- [ ] 1.2 Add one test to `test/jail.test.ts` whose stub worker replaces its reply with a symlink to a file outside the jail and its usage with a FIFO, then exits 0. Verify the wrapper exits nonzero, its error names `reply.json` and `usage.json`, and neither loop path exists.
- [ ] 1.3 In the README's Sandboxing section, say that the wrapper copies the relayed reply and usage only when each is a regular file and otherwise fails naming it. Verify the paragraph matches the delta spec.
- [ ] 1.4 Run `npm test` and verify it passes.
