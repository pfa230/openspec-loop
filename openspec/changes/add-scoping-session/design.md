# Design

## Context

See `proposal.md` for motivation and issue #14. The inspected implementation has five run commands in `src/cli.ts`, enrollment and prerequisite checks in `src/commands.ts`, and run integration and delivery in `src/controller.ts`. `src/config.ts` already separates structural configuration reading from worker-command resolution. `src/git.ts` already provides worktree discovery and upstream/base selection. `test/helpers.ts` supplies temporary repositories, bare remotes and a recording GitHub stub; `test/delivery.test.ts` covers default-branch preservation and interrupted publication.

The current contract accepts native proposals on their own branches, owns only explicitly enrolled changes, and adds no gates to hand-authored work. Current **run** delivery leaves the default branch untouched in `local`, rebases with a merge fallback, and archives before publication. Issue #14 instead asks for **proposal-session** local delivery to fast-forward the default branch, and for a finish rebase. The delta explicitly qualifies the existing Integration and delivery and Integration method clauses as run-specific, then adds attended scoping requirements. It preserves those run rules and does not use the run controller to publish proposals.

The package already includes `skills` in its published files. README setup currently copies only `skills/openspec-loop`; adding another shipped skill needs installation guidance, not a new installer or package entry.

## Goals / Non-Goals

**Goals:** Use ordinary Git worktrees and commits as the durable session, reuse the existing configuration and branch-update protections, and give the attended skill a deterministic start and finish boundary.

**Non-Goals:** No new run stages, workers, session database, hooks, unattended issue choice, proposal-content gate, cleanup lifecycle or batched implementation. Commands deliver committed work; the skill and user own what they authored.

## Decisions

### Commands and session identity

Add exactly `loop scope start <session>` and `loop scope finish <session>`, with no options. Use branch `scope/<session>` and worktree `<configured-worktrees>/scope-<session>`. Let Git validate the generated branch name and surface its error; add no separate name taxonomy. Start branches from the configured **local** default-branch commit without fetching or updating that branch. Print the path, branch, and finish command with the invoking checkout named.

Finish discovers the session worktree from Git's worktree list by its branch, so changing the configured worktree directory does not lose existing work. Both commands call `readConfig()` from the invoking checkout, including its existing shared main-checkout and invoking-checkout local overrides, without `resolveRoles()` or run enrollment. Finish uses `deliveryBase()` when a remote is needed. Use the same invoking checkout for finish unless the user deliberately wants another checkout's configuration. The skill remembers and reports this convention; commands do not copy machine-local files or store a configuration snapshot.

Existing branch/path collisions refuse without modification: report the actual registered checkout if there is one, or say that the branch exists without a registered checkout. Missing finish worktrees refuse with exit 2 and suggest `git worktree list`, completing or aborting a manual rebase, or restoring the session checkout before retrying. A stopped manual rebase lists its worktree as detached, so branch-based discovery cannot reliably identify it; do not add a path registry to work around that attended condition. Continuing interrupted drafting means reopening the reported worktree and inspecting its files and commits.

### Integration and default-branch updates

Implement session operations in `src/scope.ts`. Extract only the existing dirty-default-checkout, fast-forward and merge-mode upstream synchronization operations into Git helpers where both commands and the run controller need them. Preserve existing controller stop/recovery messages through its wrappers; do not create a second controller or a general delivery framework.

Finish requires the session worktree to have no uncommitted tracked or untracked changes. Keep this existing design decision: interrupted drafts remain available for continued authoring, but do not permit delivery until the user completes them or deliberately moves them elsewhere. Finish does not stage, commit, stash or delete drafts, or inspect proposal contents. Ignored local configuration remains ignored under the project's own rules.

- `local`: use the current local default branch as the base; rebase, check clean default holders and ancestry, then fast-forward the default branch. Contact no remote.
- `pr`: fetch the default branch's configured upstream and rebase onto that upstream ref; push the session branch without setting an upstream or forcing, then find or create one proposal PR. Leave the local default branch alone.
- `merge`: fetch that upstream; refuse when the local default branch is ahead or diverged, or its tracked checkout is dirty; fast-forward it if behind. Rebase session commits onto the resulting local default branch. Recheck default-checkout cleanliness and ancestry before publishing; push the session tip to the upstream default branch, then fast-forward the local default branch.

Rebase with `--no-update-refs`, so user Git settings cannot move unrelated refs. Abort a conflicting rebase that finish started and report the error and manual recovery in the session worktree. Do not use the run's merge fallback: there is no implementer to receive conflicts, and the attended user can resolve and continue a manual rebase before retrying finish. Preserve any pre-existing user operation. A detached rebase is handled by the missing-checkout refusal above; when Git itself rejects a command because an operation is in progress, surface that error.

Reuse the existing fast-forward's `--ff-only --no-overwrite-ignore` behavior. For an unchecked-out default branch, capture its tip before checking ancestry and pass that same tip as `update-ref`'s expected old value through the shared helper, including the run controller's callers. The current controller re-reads the tip at update time, which can accept and overwrite a concurrent writer's commits; sharing that behavior unchanged is unsafe. A stale expected tip must fail and report recovery, not retry with a freshly read value. This is an ephemeral value, not a new persisted field. Never stash, discard user files, force-push or silently switch delivery modes. A failed push leaves the local default branch at its pre-publication tip; a prior reported synchronization with upstream may already have moved it.

### Publication and retry use observed effects

Use the default branch's upstream remote and upstream branch for publication and PR targeting, as existing run delivery does. After the explicit non-force push, find an open PR by head and base before creating one. Create it with `gh pr create --fill` and explicit repository, head and base; add no custom title/body builder or temporary body file. The installed GitHub CLI 2.100.0 source (`pkg/cmd/pr/create/create.go`, `initDefaultTitleBody`) uses a single commit's subject as the title, or lists multiple commit subjects in the body. Each proposal commit subject includes its issue and change name, so either form preserves the source references. Never use a closing issue keyword in a proposal commit or PR.

Retry finish by re-reading Git refs and worktree cleanliness, then looking up an open PR only after the push succeeds. Skip a rebase when the base is already an ancestor of the session tip. If merge publication succeeded before the local update failed, upstream synchronization can complete that pending update without rewriting proposals. Open-PR reuse is conditional on a successful non-force push; it does not promise success when a moved base causes published commits to be rebased.

For that rejected PR retry, the recovery is explicit: in the session worktree, fetch the configured upstream's session branch and current base, merge the published session history into the rebased local branch, then merge the current base if it is not already an ancestor. Resolve and commit any conflicts before retrying finish. Both the published tip and current base are then ancestors, so finish skips another rebase and the push can fast-forward. Resetting to the published tip alone is insufficient because finish would rebase it again. Preserve non-force behavior; add no publication marker, automatic force push or mode switch. Retain the branch and worktree after success for inspection; manual cleanup uses Git.

Use existing progress-line conventions for worktree creation, fetch, rebase, push, fast-forward and PR effects. Return 0 on success; 2 for malformed syntax, invalid/missing configuration, name/path collisions, a missing session checkout, uncommitted session work or a missing required upstream; and 1 for integration/publication failures, including dirty default holders, ahead/diverged defaults, conflicts, rejected pushes and failed fast-forwards. Quote errors and name attended recovery and the retry command. No transcript store, stage flags or durable success marker is needed.

### Attended scoping skill

Ship one `skills/openspec-scope/SKILL.md` usable by Claude and Codex. Follow the existing skill packaging and README copy convention. Read applicable repository instructions and honor any repository-specific issue-listing workflow; otherwise use `gh` to read open issues and rank blockers, correctness work, and small decided work, explaining the ordering. Wait for the user's selections, then start or reopen a named session. Run `loop scope` commands and proposal commits outside a sandbox that makes the shared Git directory read-only, following the existing supervision skill's permission convention; do not fall back to writing in the default checkout.

For each selected issue, read its details and explicitly set the session worktree as the working directory for native proposing, all OpenSpec context/artifact commands and artifact-only Git commits. Verify the resolved OpenSpec root and artifact paths are in that worktree before writing or staging. Inspect the resulting artifacts with the user. Do not assume an invocation can continue past its planning boundary: if native proposing stops for review, resume the attended scoping workflow only when the user requests the next action. Resolve decisions that materially affect behavior with the user; use clearly recorded defaults for routine choices. Trim work to one coherent implementable change, record non-goals and file omitted requested work as follow-up issues that link the original issue and name the OpenSpec change. Link the follow-up issue from the proposal's non-goals; no unpublished proposal URL is required. Explicit invocation of the scoping skill authorizes these follow-up filings; unrelated issues are outside its scope.

Record `Source issue: <URL>` in each proposal and decisions/defaults in `design.md`. Commit only `openspec/changes/<change>/` as soon as that proposal is ready, with a subject such as `docs(scope): propose <change> (relates to #N)`. A completed proposal commit is the recovery record; partially drafted artifacts stay in the worktree. Continue or finish when the user chooses; never start implementation or automatically enroll the proposed changes. README and the skill must instruct the user to run or step a landed proposal from the default branch, after merging the proposal PR in `pr` mode. Enrolling from the multi-proposal session branch makes sibling proposal commits part of the selected change's patch. Documentation is sufficient; add no new enrollment gate. Existing issue #13 covers eventual batch execution, and source issues stay open until implemented.

## Risks / Trade-offs

- Local session delivery updates the default branch, unlike local run delivery. Document and test this explicit distinction; the run regression suite must retain its current expectation.
- Concurrent default-branch movement can cause an ancestry refusal or rejected push. Recheck before publication, preserve non-force behavior, and report attended reconciliation rather than add locks or automatic retries across human sessions.
- A retry after rebasing an already-published PR branch may need manual reconciliation. Keep the existing non-force policy rather than add force-push configuration.
- Finish refuses incomplete drafts to keep rebasing and delivery restricted to clean committed work. The user can continue authoring in place; the command does not sacrifice drafts to finish early.
- Local configuration is not copied to the session worktree; existing configuration reading inherits shared main-checkout settings. Report the invoking checkout and finish there to preserve its overrides; native proposing itself does not need loop worker settings.
- Git conflict resolution and obstructing files can leave finish incomplete. Preserve the session worktree and report the exact error; add no cleanup fallback.

## Migration Plan

No state or configuration migration. Release the additional CLI commands and shipped skill together, update README instructions to copy both skills, and leave native proposing and existing run commands available. Rollback means using native proposing and ordinary Git worktree/rebase/publication commands; session files and commits remain ordinary repository work.

## Cut audit

Each retained item below names the delta requirement it serves and the simpler alternative's concrete failure. Existing mechanisms are reused, not implemented a second time.

### Removed

- Separate kebab-case/name validator: Git already validates the generated branch name; the additional taxonomy prevented harmless Git-valid names without protecting a contract behavior.
- Custom PR title/body builder and temporary body file: the verified `gh pr create --fill` behavior already preserves issue-bearing commit subjects in single- and multi-proposal PRs.
- `npm pack --dry-run` packaging recheck: the existing package's `files: ["skills"]` already includes the new skill directory; README copy instructions are the missing delivery work.
- Repeated shared-helper behavior matrices in scope tests: retain the existing run/helper regressions and test scope wiring once per behavior.
- Read-only skill walkthrough as execution evidence: replace it with an attended disposable-repository rehearsal that inspects actual commits, paths, follow-up calls and pauses.
- Empty-session success special case and its dedicated test: no contract clause requires it; ordinary Git/GitHub results already report whether anything can be published.
- Dedicated unfinished-operation preflight: Git already refuses the operation and supplies the error; retaining that error and preserving a pre-existing operation is sufficient.
- Separate delivery controller, configuration snapshot, session registry, stage records and resume command: existing configuration plus Git refs, worktrees and commits hold what the session needs.
- Proposal-content validation gate, issue-reference index and automatic cleanup: the user owns authoring, proposal files/commits contain references, and Git owns worktree cleanup.

### Retained mechanisms, options, checks and records

- Start command: Scoping session commands; manual worktree creation repeats the setup issue #14 asks to remove.
- Finish command: Scoping session integration/delivery; a printed recipe alone cannot deterministically integrate and publish the proposals as requested in #14.
- Named session branch: Scoping session commands/recovery; using the default branch dirties its checkout and interferes with concurrent delivery.
- Separate worktree: Scoping session commands/recovery; proposing in the invoking checkout recreates the dirty-main problem in #14.
- Exact command syntax and Git-owned name validation: Scoping session commands; ignored arguments can select a different operation, while Git's existing validator is sufficient for generated branch names.
- Existing configuration/local overrides: Scoping session commands; hardcoded branch, path or mode disregards the project's delivery settings.
- Existing worktree-list lookup: Scoping session recovery; deriving finish's path anew from a changed `worktrees` setting loses the existing session.
- Missing/detached-checkout diagnostic: Scoping session commands; falsely naming a continuation directory for a detached rebase or removed checkout sends the user to nonexistent session work. Git's worktree list plus attended recovery suffices; no registry stays.
- Existing Git collision refusal: Scoping session commands; reset/replacement destroys interrupted proposal work. No replacement or force option is added.
- Clean session prerequisite including drafts: Scoping session integration; ignoring unfinished tracked work conflicts with rebasing, while allowing only some uncommitted work adds a new distinction without an issue requirement. Continued authoring preserves the drafts.
- Existing upstream/base selection: Scoping session integration/delivery; always using local main misses a moved PR base or publishes to the wrong upstream.
- Existing merge-mode upstream synchronization: Scoping session integration; publishing an ahead/diverged default can inadvertently publish unrelated local commits.
- Finish rebase with unrelated-ref updates disabled: Scoping session integration; omitting rebase misses concurrent base changes, and allowing update-refs can move unrelated branches.
- Rebase-conflict abort and Git error: Scoping session integration/recovery; fallback merge has no worker to resolve it, and silent failure leaves the session's status unclear.
- Existing clean default-holder and ancestry checks: Scoping session delivery; unchecked publication or updates can conflict with someone's tracked edits or miss default-branch commits.
- Existing safe fast-forward/checkouts: Scoping session delivery; plain ref assignment leaves checkout files stale, and unrestricted merge can overwrite ignored files or create a non-fast-forward update.
- Ephemeral checked-default-tip argument for compare-and-swap: Scoping session delivery and modified Integration and delivery; re-reading the expected old tip at update time can replace a concurrent writer's commits. No persisted state field is needed.
- Existing delivery modes, non-force publication and merge push-before-local-update: Scoping session delivery; omitting a configured mode misses #14, and local update before a rejected push misrepresents publication. No new mode or flag is added.
- Open-PR lookup: Scoping session recovery; unconditional creation duplicates a PR whose creation already took effect.
- Native `gh pr create --fill`: Scoping skill/delivery; a bare session title omits source references, while GitHub CLI's existing commit-derived title/body suffices without a new record or builder.
- Conditional PR reuse and manual published-history/base merge recovery: Scoping session recovery; resetting only to the published tip repeats the rejected rebase/push, while blind reuse claims success before publication succeeds.
- Existing progress convention and failure/exit reporting: Scoping session recovery; silent external effects or undifferentiated failure leave the user unable to choose a recovery.
- Git-based retry and retained worktree: Scoping session recovery; deleting work or replaying effects blindly loses drafts or duplicates publication.
- One scoping skill: Scoping skill; commands alone cannot select issues or settle proposal decisions with the user.
- Repository-directed ranking and user selection: Scoping skill; automatic issue choice skips the attended scope decision requested in #14.
- Native OpenSpec proposing: Scoping skill; a custom planner duplicates the repository's existing artifact workflow.
- Explicit native-command working directory and resolved artifact paths: Scoping skill; relying on the invoking harness's default directory writes proposals into the default checkout. Reuse native OpenSpec's context rather than add another artifact validator.
- Shared-Git write permissions: Scoping skill; sandboxed commits can be refused even with a writable worktree. Reuse the existing supervision skill's permission convention.
- Source-issue reference in proposal: Scoping skill; an unlinked proposal loses the issue it prepares.
- Decisions/defaults in design: Scoping skill and Attended proposal; unwritten choices stop later unattended review or revision.
- Trimmed scope, source-issue/change reference and follow-up/non-goal links: Scoping skill; simply dropping requested work loses it, while requiring an unpublished proposal URL is impossible. Existing issue URL and change name suffice.
- Individual artifact-only proposal commit: Scoping skill/recovery; one end-of-session commit loses completed proposal boundaries when interrupted and can include unrelated edits.
- README command/setup guidance using existing skill packaging: issue #14 and Scoping skill; shipping a skill without the copy/update instructions leaves it unavailable in Claude/Codex projects.
- Default-branch enrollment guidance after landing: Scoping skill and Explicit enrollment; enrolling the multi-proposal session branch makes sibling proposals part of the selected change's patch. Documentation suffices; no new enrollment gate stays.
- Explicit run-qualified modified requirements: modified Integration and delivery/Integration method; an informal exception in design leaves the contract's global wording ambiguous about local updates and conflict handling.
- No session-state fields or durable records beyond the existing Git worktree/branch/commits and native proposal/design: Scoping session recovery; the simpler existing records suffice, so no additional fields stay.

### Retained tasks and verification

- Task 1.1, sharing Git protections and concurrent-ref regression: Scoping session integration/delivery and modified Integration and delivery; unchanged sharing preserves the stale-tip race, while duplicate helpers can change branch preservation independently.
- Task 1.2, command/start/discovery tests and docs: Scoping session commands/recovery; omitting them leaves syntax, collisions, detached recovery and checkout preservation unverified or unusable.
- Task 2.1, integration tests and recovery docs: Scoping session integration; happy-path rebasing alone misses moved bases, incomplete drafts and conflicts. Existing helper tests supply the full synchronization matrix.
- Task 2.2, mode/publication/retry tests and docs: Scoping session delivery/recovery; happy paths miss the published-branch/moved-base rejection and non-duplicate retries. Test command wiring once rather than duplicate shared behavior matrices.
- Task 3.1, shipped skill/attended rehearsal/copy and enrollment docs: Scoping skill and issue #14; CLI tests or a read-only walkthrough cannot establish actual proposal commits, follow-up calls and decision pauses.
- Task 4.1, npm test/strict validation/enrollment regression/cut pass: repository instructions and Explicit enrollment; isolated session checks miss interference with the existing single-change workflow.

### Implementation cut pass

- Removed the direct compare-and-swap helper test: the run and scope publication regressions already move an unchecked-out default ref between ancestry checking and updating it, proving both callers preserve the concurrent commit. The simpler two caller tests retain the contract evidence without mirroring the helper.
- Kept NUL-delimited parsing in the existing worktree lookup: Scoping session commands and delivery; line-delimited porcelain quotes Git-valid session names and configured paths, causing false missing-checkout refusals and broken holder checks.
- Kept shell quoting in printed finish commands: Scoping session commands and recovery; raw interpolation turns harmless Git-valid names containing shell syntax into executable text when copied.
- Kept the ephemeral pre-existing-rebase observation: Scoping session integration and recovery; unconditional abort after Git rejects an existing rebase can destroy the user's manual operation. This is an ownership observation, not a new preflight gate or persisted field.
- Kept publication of the checked commit in merge mode: Scoping session delivery; re-resolving a mutable branch at push time can publish a different tip from the one checked for default ancestry.
- Kept the existing shared-config merge behavior after rebasing onto the concurrent configuration change: Scoping session commands; copying or adding a session snapshot would duplicate `readConfig()` and lose later invoking-checkout choices. No scope-specific configuration mechanism was added.
