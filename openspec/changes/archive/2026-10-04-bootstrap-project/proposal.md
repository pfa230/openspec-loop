## Why

The repository holds the product contract and native OpenSpec setup but no package, so the controller in #3 has nothing to build on. This change adds the smallest project that installs, builds and runs its own checks from a clean checkout, independent of the legacy repository, and settles which OpenSpec CLI the loop runs.

## What Changes

- Add a TypeScript ESM package for Node 24 and later, built with `tsc` and tested with Node's built-in test runner. `typescript` and `@types/node` are the only dependencies.
- Declare the `loop` command the contract names. Until #3 adds commands, it prints usage and exits nonzero, and a test runs it through the package's bin entry.
- Make `npm test` the one declared check: it builds the package and runs the tests. A GitHub Actions workflow runs it on every push to `main` and every pull request.
- Settle the OpenSpec dependency: the loop runs the `openspec` command on PATH, the same CLI the user runs by hand, requires version 1.14.0 or later and sets no upper bound. The package declares no OpenSpec dependency.
- Regenerate the native OpenSpec integration with OpenSpec 1.14.0 and keep the default `spec-driven` schema; no custom loop schema.
- Add a concise README and repository agent instructions (`AGENTS.md`, imported by `CLAUDE.md`) based on the contract.
- Copy nothing from the legacy repository; no utility has a concrete need yet.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: adds the OpenSpec CLI requirement: the loop uses the `openspec` on PATH with the repository's native setup, refuses a run when that CLI is missing or older than 1.14.0, and sets no upper bound.

## Impact

- New files: `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`, `src/cli.ts`, `test/cli.test.ts`, `.github/workflows/ci.yml`, `README.md`, `AGENTS.md`, `CLAUDE.md`.
- Regenerated files: the OpenSpec skills and commands under `.claude/`, `.agents/` and `.opencode/`.
- Developers and users need Node 24 or later and OpenSpec 1.14.0 or later on PATH.
- The OpenSpec version check is specified here and implemented by #3 together with `loop run` and `loop resume`, which do not exist yet.
- Publishing and the license are left to #10.
