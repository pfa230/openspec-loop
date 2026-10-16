# Tasks

## 1. Resolve package-owned worker commands

- [ ] 1.1 Add a small package-relative resolver using the existing `bin` manifest and integrate it into `src/config.ts`; extend configuration tests to cover all five bundled names without the package bin on PATH, competing PATH commands, explicit-path overrides, unavailable package files and unchanged custom lookup. Reuse a relocated package fixture to execute a bundled adapter against a stub harness from a linked worktree with another installation on PATH and npm's prefix pointing elsewhere; verify a valid reply from the executing package and passing focused tests after building.
- [ ] 1.2 Update README installation and configuration guidance to explain bundled-name ownership, the breaking PATH precedence change, explicit-path migration and external prerequisites; verify every documented lookup rule against the spec delta and configuration tests.

## 2. Resolve the wrapped adapter

- [ ] 2.1 Use the same resolver for `src/jail.ts`'s wrapped command before mapping and invocation while preserving original harness identification; extend existing jail fixtures to execute a bundled adapter with a stub harness and no package bin on PATH. Verify absolute invocation, argument preservation, package/harness/OpenSpec maps, credential shares, reply relay, exit status, unavailable bundled files and unchanged custom commands with the focused jail tests.
- [ ] 2.2 Update README sandboxing guidance to describe package-owned wrapped commands and continued external-tool lookup; verify the documented `[loop-jail, loop-opencode, --auto]` example against the new jail fixture.

## 3. Verify installed behavior

- [ ] 3.1 Run `npm test` and `openspec validate fix-bundled-command-resolution --strict`; verify both pass and review the final diff against the two resolution requirements without machine configuration changes or additional runtime mechanisms.
