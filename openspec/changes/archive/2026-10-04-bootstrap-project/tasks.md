## 1. Package and check

- [x] 1.1 Add `package.json` (name `openspec-loop`, `private`, `type: module`, `bin.loop` pointing at the compiled `src/cli.js`, `engines.node >=24`, `files` limited to the compiled `src/`, scripts `build` and `test`), a strict `tsconfig.json` compiling `src/` and `test/` into `dist/`, and a `.gitignore` for `node_modules/` and `dist/`; add the latest `typescript` and `@types/node` 24 as dev dependencies and verify `npm install` succeeds and writes `package-lock.json`
- [x] 1.2 Add `src/cli.ts` with a `#!/usr/bin/env node` shebang that prints usage to stderr and exits with status 2, and `test/cli.test.ts` that runs the file named by `package.json` `bin.loop` and asserts status 2 and usage on stderr; verify `npm test` builds and passes, and that it fails when `bin.loop` names a missing file
- [x] 1.3 Verify the packaging path: `npm pack`, install the tarball into a temporary prefix, run its `loop` command and confirm it prints usage and exits with status 2

## 2. Native OpenSpec setup

- [x] 2.1 Run `openspec update` with OpenSpec 1.14.0 and verify the diff touches only the generated skills and commands under `.claude/`, `.agents/` and `.opencode/`, `openspec/config.yaml` still selects `spec-driven`, and `openspec validate --all --strict` passes

## 3. CI

- [x] 3.1 Add `.github/workflows/ci.yml` running `npm ci` and `npm test` on Node 24 for pushes to `main` and for pull requests; verify by opening a pull request for the branch, since a branch push alone does not trigger the workflow, and confirming its run passes with `gh run watch`

## 4. Documentation and agent instructions

- [x] 4.1 Write `README.md`: what openspec-loop is, that it is under construction with the contract at `openspec/specs/loop-workflow/spec.md`, the prerequisites (Node 24 or later, OpenSpec 1.14.0 or later on PATH) and the development commands; verify each documented command runs as written
- [x] 4.2 Write `AGENTS.md` (source of truth is the `loop-workflow` spec, `npm test` is the check, the minimal-by-design rule, edits go in a worktree under `.worktrees/` on their own branch) and `CLAUDE.md` containing only `@AGENTS.md`; verify both files exist and `CLAUDE.md` has no other content

## 5. Clean-checkout verification

- [x] 5.1 Clone the branch into a temporary directory, run `npm ci` and `npm test`, and verify they pass; verify with `rg` that no tracked file outside `openspec/` references the legacy checkout or its paths
- [x] 5.2 Run `openspec validate bootstrap-project --strict` and verify it passes
