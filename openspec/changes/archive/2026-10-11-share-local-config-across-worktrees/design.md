# Design

## Context

See proposal.md for the failure and the Loop configuration delta for the amended contract. `start` in `src/commands.ts` calls `readConfig(top)` before enrollment or continuation. `readConfig` currently reads only two files under `top`; its parser already checks files independently, and its merge already implements whole-setting replacement and entry-wise replacement for agents, roles and attempts. `src/state.ts` resolves the common Git directory for shared run records, while `src/git.ts` already wraps Git commands and parses worktree listings for delivery.

The README recommends ignoring the local file. `test/config.test.ts` currently uses directories without Git initialization, and command tests mostly write local overrides into the invoking checkout. The shipped supervision skill likewise reads only invoking-checkout configuration.

## Goals / Non-Goals

**Goals:** Keep existing local files usable, inherit their settings in fresh linked worktrees, and preserve explicit worktree customization and branch-specific committed settings.

**Non-Goals:** Global configuration, copying files at worktree creation, configuration snapshots in run state, new command options, changes to delivery or locking, or changing how relative agent commands and worktrees paths resolve.

## Decisions

### Keep the shared file in the primary checkout

The primary checkout's `openspec/loop.local.yaml` supplies shared overrides for its clone. It is independent of `defaultBranch`: branch switching, detaching the primary checkout, or checking the default branch out elsewhere does not move the shared configuration. Separate clones remain independent.

Moving the file into the common Git directory would avoid locating the primary checkout but would require users to move existing settings. Copying or symlinking it into each worktree would preserve the bug's setup burden. Neither is needed for ordinary clones.

### Discover the primary checkout through Git

Keep a small path resolver in `src/git.ts`, using the existing Git wrapper. If the invoking checkout's absolute Git directory equals its absolute common Git directory, it is the primary checkout, including a primary checkout initialized with `--separate-git-dir`. Otherwise inspect Git's first worktree record, with NUL-delimited porcelain so spaces, newlines and quoted paths are not misparsed. A bare primary record means there is no shared checkout.

For an ordinary linked-worktree clone, the primary record identifies the checkout. Verify that the resolved candidate is a working tree of the same common Git directory before reading its configuration. Use no default-branch lookup, filesystem search or Git configuration reads or writes to supply an alternate primary path.

An exploratory temporary-repository command confirmed a concrete Git limitation: `git init --separate-git-dir <metadata>` followed by adding a linked worktree makes `git worktree list --porcelain` report `<metadata>` as the primary worktree. That linked layout takes the specified location refusal; do not add a configuration-based recovery path. A direct invocation in the actual primary checkout remains supported through the Git-directory comparison. Test that direct invocation and the linked-worktree refusal.

### Apply one explicit merge order

Read the invoking checkout's required `openspec/loop.yaml`, then the primary checkout's optional local file, then the invoking checkout's optional local file if it is distinct. Validate each present file before merging. Fold the existing merge rules over these sources, then check required fields once. Missing optional files are accepted; read errors and invalid content are refused even if a later file overrides the affected setting.

Reading only the invoking file reproduces the reported failure. Selecting only one of the two local files would discard shared values when a worktree customizes a single setting. Reading the primary checkout's committed file would discard branch-specific configuration. Three ordered sources preserve all three behaviors without a new settings type or provenance database.

Keep the `readConfig(top)` interface. Each invocation resolves and rereads the sources during existing preparation, with no added state fields, caching or configuration snapshot. Relative `worktrees` paths and commands containing `/` remain relative to the invoking checkout, as the current contract and README prescribe.

### Match documentation and diagnosis to the merge order

Update README setup and configuration text to describe the primary file as shared, the optional linked-worktree file as a higher-priority override, and the explicit Git-layout limitation. Keep the existing ignore advice. Permit the shipped supervision skill to run the read-only commands `git rev-parse --absolute-git-dir`, `git rev-parse --path-format=absolute --git-common-dir`, and `git worktree list --porcelain -z` from the invoking checkout to locate the primary checkout using the same rules as the resolver. Update its allowed config reads and failing-agent lookup to consult invoking local, primary local, then invoking committed configuration, choosing the highest-priority file defining the alias. The existing Supervision skill requirement already requires diagnosis from the failing agent's configured command; it needs no duplicate requirement.

### Verify with real linked worktrees

Initialize Git in the configuration fixture and exercise ordered merging in real linked worktrees, including missing and invalid shared files, shared-only required fields, and per-worktree overrides. Cover malformed or unreadable shared files in these configuration tests, without duplicating the same refusal on each command or spying on file-read counts.

Add one enrollment regression that commits the proposal on an issue branch, ignores the primary local file, and invokes `run` from the fresh linked issue worktree. Assert selected agent arguments and actual check execution. Add one continuation regression that stops an enrolled run, edits primary local settings, then invokes `step` from another checkout, asserting updated agent/check behavior and the unchanged recorded run worktree. `run`, `resume` and `step` all call the same `start` and `prepare` functions, so no command matrix is needed for configuration reads.

Reuse the existing stub agents, `makeRepo`, `runLoop`, and state assertions. Include a branch-specific committed configuration case, a bare repository, separated metadata, and paths containing whitespace. Retain one detached or switched primary-checkout regression: it catches a resolver that incorrectly searches for the configured default branch instead of locating the primary checkout. No real model calls or remote service are needed. `npm test` remains the required application check.

## Risks / Trade-offs

- Shared overrides now affect existing linked worktrees that previously ignored them. Document that a worktree's explicit entries take precedence and unspecified entries inherit.
- A primary checkout can be unavailable or Git may not expose its true location. Refuse with the actual path or Git-layout problem; never substitute committed defaults silently.
- Ignored local files can be edited concurrently. Preserve the existing rule of reading once per command; this change adds no cross-command snapshot or transactional editor.

## Migration Plan

No local file move is needed. Install the changed package and refresh project copies of the supervision skill through the existing documented copy command. No live repository or user configuration is changed by implementation. Reverting the change restores invoking-checkout-only reads.

## Cut Pass

Each retained item serves the amended Loop configuration requirement unless a different source is named below.

- Invoking committed source stays: substituting primary committed settings loses configuration committed on the issue branch.
- Primary local source stays: invoking-only reads lose ignored settings in every fresh issue worktree.
- Invoking local source stays: removing it breaks existing explicit worktree overrides; choosing it instead of merging drops unspecified shared settings.
- Existing setting and entry merge rules stay: reuse them; a second parser or settings representation has no concrete need.
- Distinct-source handling stays: the amended source order includes the invoking local file only when it is distinct; use that rule without a separate read-count guarantee or test.
- Git directory comparison stays: list-only discovery mistakes separated metadata for the primary checkout when invoked directly in that checkout.
- Primary worktree record stays: searching for the default branch moves the config source when branches move and cannot supply an overridden default branch before config is read.
- NUL-delimited paths stay: splitting quoted porcelain lines mislocates checkouts with newline or quoted names; no generic worktree parser is needed.
- Candidate identity check stays: trusting the separated-metadata record reads outside the primary checkout, reproducing silent loss of settings.
- Bare-primary handling stays: treating a bare Git directory as a checkout invents a shared config location.
- Location/read refusals stay: ignoring a failed discovery or read starts workers with different settings; reuse the existing Refusal and file-read error handling.
- Independent file validation stays: validating only the merged result masks malformed shared settings; reuse the existing parser.
- Per-command rereads stay: caching or snapshotting misses changed overrides on resume or step; reuse existing preparation.
- Invoking-relative paths stay: changing path bases breaks the existing worktrees and agent-command rules; no per-source path metadata is needed.
- README and supervision edits stay: Loop configuration and the existing Supervision skill requirement need setup and diagnosis to use the effective sources; leaving invoking-only instructions points diagnosis at the wrong agent command.
- Supervision's Git directory reads stay: the existing Supervision skill requirement needs the primary checkout for agent diagnosis; using the worktree list alone misidentifies a directly invoked separated-metadata primary checkout.
- Supervision's worktree-list read stays: the existing Supervision skill requirement needs the primary path when invoked from a linked checkout; the current report gives only the run's checkout.
- Branch-independence regression stays: the amended Loop configuration requirement identifies the primary checkout independently of branches; omitting this test misses an incorrect default-branch lookup.
- Task 1.1 stays: primary lookup has to identify real Git layouts; directory-name guessing fails the observed separated-metadata case.
- Task 1.2 stays: object-level merge and refusal checks isolate the new contract; command-only coverage cannot distinguish individual source and entry precedence reliably.
- Task 1.3 stays: the user needs correct setup and effective-agent diagnosis; code changes alone leave both instructions wrong.
- Task 2.1 stays: the user's explicit fresh-issue-worktree failure requires one command-level enrollment regression; merged-object checks do not establish actual worker/check behavior.
- Task 2.2 stays: Loop configuration explicitly rereads on continuation; one continuation regression establishes changed settings and preserved run worktree without a command matrix.
- Task 3.1 stays: `npm test` is the repository's required check, and strict OpenSpec validation checks the amended contract; focused tests alone do not satisfy either.
- Proposal, delta spec, design, tasks and schema metadata stay: the explicitly requested propose workflow requires these planning records; skipping one leaves the apply workflow without its dependency.
- Removed `core.worktree` handling and its declared-path tests: an alternate Git-configuration lookup serves no demonstrated delivery need; the location refusal already covers the observed unresolvable layout.
- Removed duplicate command variants for enrollment, continuation and malformed shared settings: one enrollment, one continuation and configuration-level refusal coverage exercise the distinct behaviors through existing shared preparation.
- Removed the explicit read-once sentence and read-count test: the distinct-source rule already specifies the source order, and read-call spying adds an implementation detail to the acceptance criteria.
- Cut the shared-config path option, new persistent source records, cached config snapshots, copying/symlinking hooks, a filesystem search, and a second configuration parser: ordered reads with existing merge and Git primitives serve the requirement without them. No new options, state fields or runtime records remain.
