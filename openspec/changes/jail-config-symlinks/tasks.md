# Tasks

## 1. Symlinked configuration

- [ ] 1.1 In `src/jail.ts`, after the harness's `readOnly` paths are added, add to the read-only maps the target of every symlink directly inside each of those paths that is a directory, resolved against that directory as design.md describes; a path that is not a directory or does not exist adds nothing. Verify the existing `test/jail.test.ts` tests still pass.
- [ ] 1.2 Add one test to `test/jail.test.ts` that runs `loop-jail` with `loop-opencode` while the test home's `.config/opencode/opencode.jsonc` is a symlink to a file outside that directory. Verify the link's target is among the read-only maps. Give the `jail` helper whatever it needs to create the link and a `loop-opencode` stub before the wrapper runs.
- [ ] 1.3 Run `npm test` and verify it passes.
