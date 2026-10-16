# Design

## Context

See proposal.md for motivation. Observed in the current source:

- `package.json` already names every shipped executable under `bin` and packages `dist/src`.
- `src/config.ts` resolves every bare agent command through `process.env.PATH` before starting workers; `src/step.ts` then invokes its absolute result with the caller's environment.
- `src/jail.ts` independently looks up the wrapped command, identifies its harness from the original command's basename and maps executable symlink chains or npm package roots read-only.
- `src/setup.ts` already anchors bundled skills to the executing module through `import.meta.url`. That package-relative ownership is the precedent for executable resolution.
- `test/config.test.ts` currently uses bundled names for some PATH fixtures; `test/jail.test.ts` supplies a fake bare `loop-claude`. Those tests will need custom names or real packaged-adapter fixtures to express the new semantics accurately.

The existing contract does not specify where bundled commands are found. This change adds that rule without changing the OpenSpec CLI requirement, which explicitly requires the user's `openspec` on PATH.

## Goals / Non-Goals

**Goals:** Make the executing package sufficient to locate its own worker commands, including the nested command inside its sandbox wrapper. Keep ordinary command arguments and the worker protocol unchanged.

**Non-Goals:** Shell startup changes, home-directory searches, npm-prefix probing, dependency installation, harness authentication, a new setup wizard or doctor command, and automatic PATH modification. The caller must still be able to launch `loop` and provide the documented external prerequisites.

## Decisions

### Resolve bundled names directly from the package manifest

Add one small shared resolver anchored to the executing module's package root, using the existing `package.json` `bin` entries for the four adapters and `loop-jail`. Bare bundled names select those absolute files before generic PATH resolution. Commands containing `/` bypass this rule. Keep the existing executable-file validation and role/alias refusal, naming the selected package path when unavailable.

Do not copy the executable paths into a second registry, query `npm`, or search adjacent installations. `src/setup.ts` demonstrates package-relative path resolution; use that approach, not a generalized resource-loading layer. A broken package must fail rather than select a different installed version.

Always selecting the package is a deliberate compatibility decision: PATH no longer overrides a bare bundled name. PATH-first lookup with a package fallback would keep accidental version mixing and create two meanings for the same configured command. An explicit path expresses an intentional override.

### Resolve the nested command at the wrapper boundary

Have `src/jail.ts` use the same resolver for its wrapped command before executable mapping and construction of ai-jail's command arguments. Retain the original adapter name for the existing harness lookup before replacing the command with its absolute package path; otherwise `opencode.js` would lose the `loop-opencode` credential and configuration shares. Pass the resolved file through the existing executable-chain mapper so the package is visible inside the jail. Leave the harness, `openspec` and `ai-jail` lookup rules unchanged.

Resolving only the first token in `src/config.ts` is insufficient for `[loop-jail, loop-opencode, ...]`. Adding the installation's bin directory to PATH would also change lookup for unrelated tools and would still depend on a particular npm link layout. Do not scan or rewrite arbitrary worker arguments; only the wrapper knows which argument is a command.

### Verify package behavior with controlled external tools

Extend existing configuration and jail tests with a relocated package fixture, reusing the relocation pattern in `test/setup.test.ts`. Exercise the installed layout and executable permissions that npm supplies, with PATH containing controlled external tools but no package bin directory. Run a bundled adapter against a stub harness so assertions establish execution, not only a returned pathname. Cover a nested jailed adapter using the existing recording ai-jail fixture, asserting the absolute invoked path, package map, harness shares, reply and status. No real model requests are needed.

Use the existing custom-command tests for PATH order, relative paths and refusals, renaming fixtures that previously impersonated bundled names. Add a PATH shadow from another installation, an explicit-path override and a missing package-file case to prove the ownership rule and its migration route. Reuse fixtures rather than introduce a parallel test harness.

## Risks / Trade-offs

- **Unresolved blocking review finding:** The recorded decision to pass the resolved adapter file through the existing executable-chain mapper does not satisfy the package-map requirement outside `node_modules`. `chain()` maps only the file's directory in that layout; the real path anchored by `import.meta.url` in the relocated fixture and an `npm link` checkout therefore yields `dist/src/adapters`, leaving package dependencies such as `undici` unavailable inside a real jail. The recording ai-jail fixture executes outside a jail, so successful execution there cannot establish dependency visibility; task 2.1 must still assert the package-root map. Mapping the shared resolver's package root directly, or extending the chain mapper to handle that layout, would require revising or adding a recorded decision. Neither is authorized in this revision, so the finding and task 2.1 remain blocked.
- Users overriding bundled names via PATH will select a different command after upgrading. Document the breaking precedence change and move intentional overrides to explicit paths in local configuration.
- Packaged adapters run as executable files, whereas TypeScript compilation alone need not set executable bits. Model npm's executable permissions in relocated fixtures; do not add runtime chmod or interpreter-wrapper behavior.
- Converting an adapter name to a JavaScript filename can lose jail harness identity. Preserve the original identification and assert its existing credential/configuration maps.
- A working bundled lookup does not establish that external tools or credentials are present. Keep the current prerequisite boundaries and failure behavior rather than promise a self-contained toolchain.

## Migration Plan

Implement and validate locally, then sync and archive through the repository workflow before any publication. Existing configurations using bare shipped names require no edits unless they relied on a PATH override; those overrides must use explicit paths. Reverting the change restores the prior PATH behavior and needs no state migration.

## Cut Pass

Removed the separate relocated-package integration task: its direct execution check belongs with task 1.1, and its jailed execution check belongs with task 2.1. Removed the additional temporary-install check because the relocated fixture models the installed layout and npm executable permissions. This revision removes the external-prerequisite outcome clause and puts it in the scenario precondition. No runtime options, state fields or persistent records are added.

| Kept item | Contract or request served | Simpler alternative and concrete failure |
| --- | --- | --- |
| Shared package-relative resolver | Bundled worker command resolution | PATH-only lookup reproduces the reported failure. |
| Existing manifest as path source | Minimal by design; bundled worker command resolution | A second path table can drift from the published `bin` entries. |
| Package precedence for bundled names | Bundled worker command resolution | PATH-first lookup can run a different installed version. |
| Existing custom-command lookup and explicit overrides | Bundled worker command resolution | Treating all commands as bundled would break custom workers. Reuse the current implementation. |
| Existing executable-file check with the package path in its error | Bundled worker command resolution | Skipping it defers an unavailable adapter to worker startup and loses the role refusal. Reuse the current check. |
| Nested wrapper resolution | Bundled commands inside the sandbox wrapper | Resolving only the outer token leaves `loop-opencode` unavailable inside the jail. |
| Existing harness identification and executable maps | Bundled commands inside the sandbox wrapper; Sandboxed harness files | Using only the resolved `.js` basename loses the harness shares; omitting the package map hides the adapter inside the jail. |
| Direct execution fixture without the package bin on PATH | Bundled worker command resolution | A pathname-only assertion cannot show that the selected installed adapter executes. |
| Competing installation and relocated-prefix checks | Bundled worker command resolution | A single installation on a normal PATH conceals version mixing and prefix-dependent resolution. |
| Custom lookup and unavailable-file checks | Bundled worker command resolution | Testing only successful bundled lookup misses broken custom overrides and unintended fallback. |
| Nested adapter execution and mapping checks | Bundled commands inside the sandbox wrapper | Direct-only coverage misses the wrapper's second lookup and harness-identity loss. |
| Unresolved package-mapping finding and task 2.1 blocker | User's request to leave findings requiring a decision change unresolved | Omitting the blocker would imply that the existing mapper can meet the package-root assertion in the relocated layout. |
| Task 1.1: resolver, direct execution and focused tests | Bundled worker command resolution | Omitting it leaves the original defect. |
| Task 1.2: lookup and migration documentation | User's installation-operability request | Omitting it leaves existing PATH overrides with an unexplained behavior change. |
| Task 2.1: wrapper integration and focused tests | Bundled commands inside the sandbox wrapper | Omitting it leaves the same defect for jailed agents. |
| Task 2.2: sandbox command documentation | User's installation-operability request | Omitting it leaves the documented wrapped command's ownership unclear. |
| Task 3.1: repository and spec validation | Repository's required `npm test`; native OpenSpec proposal workflow | Focused tests alone do not check integration with the rest of the package or validate artifact structure. |
