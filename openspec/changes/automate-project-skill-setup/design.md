# Design

## Context

See `proposal.md` for the installation failure this change addresses. The CLI currently dispatches run control and scoping commands. `src/git.ts` already provides `topLevel(cwd)`, which identifies the invoking working tree even from a subdirectory. `package.json` ships `dist/src` and `skills`; no packaging change is needed to make the existing skills available to a setup command.

The archived `package-first-release` design, decision 2, deliberately chose committed project copies and rejected a copy command. The current request supersedes that manual-copy decision while preserving project-local installation. The user accepted a supported project install/update command over global exposure during npm installation.

## Goals / Non-Goals

**Goals:** Provide an explicit installation and refresh operation using the executing package's skill contents, without depending on a matching npm prefix or completed loop configuration.

**Non-Goals:** User-level skill installation, npm lifecycle hooks, automatic updates across repositories, project registries, generated loop configuration, Git hooks, automatic commits, harness restarts, new supervisor support or changes to the skills' workflows. Package upgrades require one explicit `loop setup` per project.

## Decisions

### One command for installation and refresh

Use `loop setup` with no options for both first installation and refresh after an upgrade. It targets both `.agents/skills/` and `.claude/skills/`, matching the existing README procedure. Separate init/update commands, tool-selection flags and destination configuration add choices without addressing the observed failure.

Dispatch setup before run or scope preparation. Resolve the invoking root with `topLevel`. Do not require an OpenSpec root, load `openspec/loop.yaml`, invoke workers or initialize OpenSpec: installing skill files does not depend on completed project configuration. A linked worktree is the target checkout; the clone's main checkout is not consulted.

### The executing package is the source

Place the operation in a small `src/setup.ts` module. Resolve the package's `skills/` directory relative to that module's compiled location under `dist/src`, using `import.meta.url`, as tests already use package-relative URLs. Enumerate its skill directories rather than maintaining another list of skill names. Install all of them in a deterministic order.

Do not call `npm root -g`, infer an installation prefix or search PATH for another package. On this machine, `loop` resolves under `~/.npm-global` while the current npm command reports `/usr/lib/node_modules`; source discovery through npm would select the wrong directory. A relocated-package test must prove that the executed package supplies the copies.

### Bundled destinations are package-owned

Refresh by replacing each destination directory whose name matches a bundled skill, then copying the packaged directory recursively. This removes obsolete files as well as updating current ones. Preserve sibling skill directories, including native OpenSpec skills. Document that local edits inside a bundled destination are overwritten; customization belongs elsewhere.

A merge-copy alone would retain removed instructions or helpers after an upgrade. A version manifest, ownership registry or content-history check is unnecessary because the command's explicit scope is the bundled names and their package-owned directories. Skills absent from the executing package are unrelated to this invocation and are left alone.

### Refuse obstructed directory paths before replacing copies

Before writing, check the required directory paths under `.agents` and `.claude`, including each bundled skill destination. Existing real directories are valid; a file or symlink is an obstruction. Refuse all installation before modification when an obstruction exists, so one tool is not refreshed before the second tool's known collision is reported. Do not follow a linked destination into another checkout or a user-level skill installation.

Create missing directories and perform the replacements after that check. Report each successful destination and use the existing `Refusal` convention for unsuitable projects and syntax (exit 2). Catch actual source/copy failures at the setup operation, report the failing path and exit 1. There is no rollback transaction or automatic retry: partial I/O failure is reported, and an explicit rerun replaces every bundled directory after repair.

### Validate installed behavior and package resolution

Extend CLI coverage for setup syntax and add filesystem tests using disposable Git/OpenSpec checkouts. Verify the actual installed contents, refresh of stale copies, addition of a missing skill, removal of obsolete bundled files, preservation of unrelated content and unchanged configuration/Git state. Check subdirectory and linked-worktree targeting and the absence of a loop-configuration requirement.

Use file/symlink collisions to prove that preflight leaves all destinations untouched. Use a relocated package fixture with a missing skill source to prove exit 1 and path reporting without adding a fault-injection option or relying on platform-specific permissions. Run the compiled command from a relocated package layout with distinct bundled contents to establish that source discovery ignores the invoking repository and npm prefix.

## Risks / Trade-offs

- **Project copies can still lag after an npm upgrade.** Document `loop setup` as the refresh step. Automatic cross-project updates are outside the accepted scope.
- **Setup overwrites customized bundled skill directories.** Document these directories as package-owned and keep unrelated skills intact.
- **A write failure can leave only some destinations refreshed.** Print completed destinations, report the failed path, exit 1 and support an explicit rerun. Transactional rollback would add state beyond this need.
- **A session may have already loaded an older skill.** The command installs files; the next session can load the updated project skills. It does not control harness processes.

## Migration Plan

After installing the release that adds setup, run `loop setup` in an existing project's checkout and review/commit the skill changes through that project's normal workflow. Projects with only the old supervision skill gain the missing scoping skill for both tools. For later package upgrades, rerun the same command and commit the refreshed copies.

Replace the README's copy loop and repeated-copy instructions with the setup command and its overwrite scope. Retain the separate configuration and ignore-file instructions. No live Labeler installation or configuration changes are part of this OpenSpec proposal.

## Cut Pass

Removed the OpenSpec-root prerequisite: copying packaged skills does not depend on an OpenSpec root, and run commands already enforce their prerequisites. Removed the tarball-install smoke task: packaging is unchanged, and the automated relocated-package test exercises the source-resolution failure without another installation procedure. No registry, version record, new configuration option, update hook or rollback state is introduced.

Each retained item maps to the amended contract:

- `loop setup`: Project skill setup; a documented copy command repeats the manual procedure that omitted the scoping skill.
- One install/refresh command with no options: Project skill setup and Bundled skill refresh; this is the simpler alternative to separate commands or tool-selection flags.
- Two fixed tool destinations: Project skill setup; one destination leaves the other supported supervisor without the skills.
- Bundled directory enumeration: Project skill setup; a separate hardcoded skill list can omit an added bundled skill, reproducing the missing-scope failure.
- Package-relative source lookup: Project skill setup; `npm root -g` selects the wrong installation on the observed host.
- Existing Git root lookup: Project skill setup; writing relative to the current directory installs into a subdirectory instead of the checkout.
- Whole-directory replacement: Bundled skill refresh; merge-copy leaves obsolete instructions or helpers behind.
- Preserve unrelated directories and configuration: Bundled skill refresh and Setup boundaries and failures; replacing tool roots would remove native OpenSpec and other project skills.
- File/symlink preflight for destination directories: Setup boundaries and failures; following a linked parent writes outside the target checkout, and checking only during copying can alter the first tool before a known second-tool obstruction.
- Per-destination success output: Project skill setup; silent success gives no installed paths to inspect or commit.
- Refusal and I/O exit statuses with the failing path: Setup boundaries and failures; one success status or silent catch hides incomplete installation.
- Task 1.1, CLI/install tests and setup documentation: Project skill setup; tests of parsing alone do not establish installed contents or correct checkout selection.
- Task 1.2, refresh/preservation tests and upgrade documentation: Bundled skill refresh; first-install tests do not expose stale files, missing skills or overwritten unrelated content.
- Task 1.3, refusal/failure tests and recovery documentation: Setup boundaries and failures; happy-path tests cannot establish untouched symlink targets or reported failures.
- Task 2.1, relocated-package test: Project skill setup; running only beside repository sources does not expose a lookup that relies on the current directory or npm prefix.
- Task 2.2, full `npm test` and OpenSpec validation: repository check requirement and contract consistency; setup-only tests omit regressions in existing CLI dispatch, and file existence does not establish valid deltas.
