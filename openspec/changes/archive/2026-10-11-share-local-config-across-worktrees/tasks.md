# Tasks

## 1. Shared configuration resolution

- [x] 1.1 Add primary-checkout discovery to `src/git.ts` using the design's Git directory comparison and NUL-delimited primary worktree record. Add real-repository tests covering an ordinary clone, one detached or switched primary checkout to catch incorrect default-branch lookup, whitespace in paths, a bare clone, and separated metadata with direct primary invocation and linked-worktree refusal; verify correct roots or the specified location refusal without an alternate Git-configuration lookup.
- [x] 1.2 Change `readConfig(top)` in `src/config.ts` to merge invoking committed, primary local, then distinct invoking local settings using the existing replacement rules and parser. Initialize Git in the config fixture and add linked-worktree cases proving shared-only required fields, partial worktree overrides, whole-setting replacement, missing optional files, invoking committed settings remaining the base, and invalid or unreadable shared files that cannot be masked by later overrides. Verify the existing and added configuration tests pass.
- [x] 1.3 Update README setup and configuration guidance and the shipped supervision skill's allowed config reads and agent lookup to match the source order, unchanged relative-path rules and Git-layout limitation. Explicitly permit `git rev-parse --absolute-git-dir`, `git rev-parse --path-format=absolute --git-common-dir`, and `git worktree list --porcelain -z` to locate the primary checkout through the resolver's rules. Verify documented precedence against configuration tests and walk diagnosis through primary-path discovery for an alias defined in primary local configuration and overridden in invoking local configuration; each selects the effective command.

## 2. Command regression coverage

- [x] 2.1 Add one enrollment regression using existing fixture helpers and stub agents that commits a proposal on a fresh linked issue branch, ignores the primary local file, and invokes `run` from that worktree. Verify shared role/agent arguments, attempts and delivery selection and actual required-check execution. Confirm the local file is neither copied nor modified.
- [x] 2.2 Add one continuation regression that stops an enrolled run, edits primary local settings, and invokes `step` from another worktree. Verify changed agent/check behavior and the unchanged recorded run worktree; rely on shared `start`/`prepare` and configuration-level tests for the common read and refusal behavior instead of repeating a command matrix.

## 3. Integration validation

- [x] 3.1 Run `npm test` and `openspec validate share-local-config-across-worktrees --strict --no-interactive`, then perform the repository's cut pass against the amended Loop configuration requirement and the existing Supervision skill requirement; verify all checks pass and every retained mechanism and task has a concrete contract purpose.
