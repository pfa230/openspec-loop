## Context

See proposal.md for why. The package is ESM TypeScript, built by `tsc` into `dist/`, with `bin` entries for `loop` and the four adapters under `dist/src`, and one runtime dependency, `yaml`. Nothing at runtime reads a file from the package outside `dist/src`. `npm pack` today packs only `README.md` and `package.json`: `dist/` is ignored by Git and nothing builds it on pack, and `files` names only `dist/src`, so the skill at `skills/openspec-loop/SKILL.md` never ships. The repository is private on GitHub. `npm whoami` is `pfa230`. The legacy package published `openspec-loop@0.1.0` and unpublished it on 2026-10-02, so the name is free and 0.1.0 is spent.

OpenSpec installs its own skills by writing them into each tool's directory in the project (`openspec init --tools ...`), where they are committed, and refreshes them with `openspec update` after an upgrade. Codex reads skills from `.agents/skills/` in the repository and Claude Code from `.claude/skills/`; #9 run B supervised a run from a Codex session with the skill at `.agents/skills/openspec-loop/`.

## Goals / Non-Goals

**Goals:**

- `npm install -g openspec-loop` gives a working `loop`, the four adapters and the skill, on Node 24 or later.
- A reader of the README alone can install the package, set up an existing OpenSpec project, supervise a run and release a new version.
- The published tarball is one whose contents ran a change in a clean project.

**Non-Goals:**

- Installing anything outside the package's own global install: no install scripts, no writes to `~/.claude`, `~/.codex` or `~/.agents`.
- Changing the project's OpenSpec setup. Setting up the loop adds `openspec/loop.yaml`, ignore lines and the two skill copies, and nothing else.

## Decisions

**1. The package.** `package.json` drops `private`, takes version `0.2.0` (with `package-lock.json`, through `npm version 0.2.0 --no-git-tag-version`), `"license": "MIT"`, and `files: ["dist/src", "skills"]`. npm always adds `README.md`, `LICENSE` and `package.json`. The build before packing is the release procedure's `npm test` (decision 5). Alternative rejected: a `prepack` script that builds, which repeats that step and guards only a person who skips the procedure. No `repository` field: it would link npm readers to a private repository. The `LICENSE` is the MIT text with `Copyright (c) 2026 Fedir Panasenko`, the author line of the legacy package.

**2. The skill is copied into each project and committed.** The skill only acts in a repository that has `openspec/loop.yaml`, so it lives there, beside the configuration, as OpenSpec's skills do. The README gives one command that copies it from the installed package:

```sh
for dir in .claude/skills .agents/skills; do mkdir -p "$dir" && cp -R "$(npm root -g)/openspec-loop/skills/openspec-loop" "$dir/"; done
```

and says to commit both copies, and to run it again and commit after upgrading the package, because the skill names the commands and flags of the installed version. Alternatives rejected by pfa: user-level copies in `~/.claude/skills/` and `~/.agents/skills/`, which load the skill in every repository on the machine; and a `loop` command that writes the copies, which adds a command, a requirement and tests to replace one `cp` and does not stop a person forgetting to run it, as `openspec update` does not.

**3. The README.** Changes, in order:

- **Opening.** Drop "under construction" and the build-issue reference. The README must stand alone on the npm page, so no relative links into the repository.
- **Prerequisites.** Drop the `#16` reference. Add that the repository is initialized with `openspec init` for the tools you use, which installs OpenSpec's skills and commands in the project; the OpenSpec CLI itself stays a prerequisite of its own.
- **Installation**, new, before Configuration: `npm install -g openspec-loop`, and `npm update -g openspec-loop` with the skill copy repeated after it.
- **Setting up a project**, new, before Configuration: commit `openspec/loop.yaml` as Configuration describes, add the worktrees directory and `openspec/loop.local.yaml` to `.gitignore`, and copy and commit the skill as decision 2 gives. State that setup changes nothing else in the project: no hooks, no OpenSpec schema or configuration.
- **Running a change.** Name the native proposing invocation of each harness: `/opsx:propose` in Claude Code and the `$openspec-propose` skill in Codex.
- **Supervising from Claude Code or Codex**, new, after Running a change: what the skill does, in a few sentences. Ask the session to run, stop or resume a change. The skill relays each progress line, shows the report unchanged, diagnoses a stop by reading only, and repairs or resumes only with your agreement. Run `loop` outside the session's sandbox.
- **Development.** Keep `npm ci` and `npm test`, name the contract's path as text, and add the release procedure of decision 5.

The rest of the README already covers roles, the three delivery modes, the usage report and recovery, and stays.

**4. The packed tarball runs a change in a clean project before anything is published.** The applier builds the tarball with `npm pack` on this branch and follows the README alone in a new disposable repository:

- **Installation.** The README's `npm install -g`, given the tarball's path. `realpath "$(command -v loop)"` and the same for each adapter must lie under `$(npm root -g)/openspec-loop/`, not in this repository through a leftover `npm link`. The install stays until the release replaces it.
- **The project.** `openspec init --tools claude,codex`, a small shell project with `test.sh`, committed on `main` with no remote.
- **Setup.** The README's setup steps, with its example `agents` and `roles`, `checks: [sh test.sh]` and `delivery: local`. `git status` and `git diff --stat` against the commit before setup show only `openspec/loop.yaml`, `.gitignore` and the two skill copies.
- **The run.** In one Claude Code session in tmux, as in #9 decision 6: a small change proposed with `/opsx:propose`, committed on `main`, and then run under the copied skill.

Every README step that fails or misleads is fixed in the README, and the exercise is repeated with a fresh tarball. The evidence goes in one comment on #10: the setup commands, the commit of this branch that was packed, the tarball's `shasum`, the pack's file list, the session's relayed lines and report, and the final Git state. Codex supervision is not run again: the skill's location in `.agents/skills/` is the one #9 run B used, and only where the file comes from changes.

**5. Publishing comes after the change merges, by the release procedure.** Tasks run before review, and a release must be the reviewed code. Completing the tasks therefore does not complete #10: it stays open until step 6. The merge happens when pfa asks for it. Once it lands, the applier releases from a detached worktree at the default branch's tip, never with `main` checked out:

1. `npm ci`, `npm test`, `npm pack`.
2. `git diff <packed commit> HEAD -- . ':!openspec' ':!README.md'` shows nothing, so the tarball runs what decision 4 ran. A difference means the exercise runs again on this tarball; a README-only difference does not.
3. `npm publish openspec-loop-0.2.0.tgz`. pfa runs it with `! npm publish ...` when npm asks for a one-time password.
4. `git tag v0.2.0` and `git push origin v0.2.0`, so the version maps to its source.
5. `npm install -g openspec-loop@0.2.0`, replacing the tarball install, then check that `loop status x` refuses for a missing run and that the skill is under `$(npm root -g)/openspec-loop/skills/`.
6. Comment on #10 with the registry URL and close it.

The README's release section is these steps with the version as a placeholder; step 2 belongs only to this release, where the exercise ran before the merge.

## Risks / Trade-offs

- [npm refuses the name or the version] → The release stops and the applier reports npm's message to pfa. No other name or version is tried without pfa.
- [A committed skill copy drifts from the installed `loop`] → The README says to copy again after every upgrade. A stale copy can describe commands, flags or recovery the installed `loop` no longer has, and nothing detects it; the re-copy step is the whole mitigation, as `openspec update` is for OpenSpec's skills.
- [The public package's README describes a private repository's workflow] → The README stands alone and links nothing in the repository.
- [The exercise covers one supervisor and one delivery mode] → Accepted. #9 covered both supervisors, all four adapters and all three modes with this code; the exercise checks the packaging, installation and setup that #9 did not.
