# Tasks

## 1. Loop skill namespace and proposing wrapper

- [x] 1.1 Rename the bundled sources and frontmatter to `loop-run` and `loop-scope`, add the short `loop-propose` wrapper from design.md, and route scoping drafts through it. Update README invocations, proposing guidance and upgrade instructions alongside the skills; verify the diff preserves supervision/scoping behavior and native delegation, includes the summary-before-inventory instruction and preserves the return to scoping without starting implementation.
- [x] 1.2 Extend `src/setup.ts` to preflight the two retired package-owned names in both tool directories and remove them after installing all replacements. Adapt the existing setup tests and fixtures for the new trio, migration from both old names, current/retired obstruction paths and preservation of native/custom skills; build and run `node --test dist/test/setup.test.js` to verify the filesystem behavior and existing setup guarantees.
- [x] 1.3 Build and run this worktree's setup command to refresh its checked-in bundled skill copies, inspect the diff to verify native OpenSpec files are untouched and both tool directories match the packaged trio, then run `npm test` for the integrated result.
