# Agent instructions

openspec-loop runs a committed OpenSpec change unattended to a delivered result. These rules apply to every agent working in this repository.

- **The contract is the source of truth.** `openspec/specs/loop-workflow/spec.md` defines what the loop does. Change behavior through an OpenSpec change that modifies that spec, not by editing code alone.
- **Minimal by design.** Every mechanism, option and check must serve a concrete delivery need. Do not add speculative configuration, plugin points, extra layers, silent fallbacks, or gates for work a person does by hand. When two designs both work, use the one with fewer moving parts.
- **Cut before presenting.** After the last artifact or edit and before any summary, run a cut pass, even when a skill's own steps end earlier. List each mechanism, option, check, state field, record and task on its own line, and name the contract clause, as the change amends it, or the user's explicit request it serves where the contract is silent, such as docs or tooling. Remove whatever names neither, and whatever duplicates what the repository already has. For each item that stays, name its simpler version and the concrete failure that version causes; when there is none, use the simpler version. The presentation includes the cut list: what was removed, and why each kept item stayed.
- **`npm test` is the check.** It builds the package and runs the tests. Run it before claiming work is done.
- **Edit in a worktree.** Several sessions share the main checkout, and a dirty main checkout blocks delivery. Make every edit in a worktree under `.worktrees/` on its own branch, never in the main checkout and never with `main` checked out in the extra worktree.
- **Clean up after merge.** Once a pull request merges, remove the worktrees and local branches it was delivered from, a loop run's included.

## Releasing

Release exactly this way. A request to release authorizes every step, including merging the release pull request and publishing.

1. In a worktree on a new branch `release-<version>` from `origin/main`, run `npm version <version> --no-git-tag-version`, commit `package.json` and `package-lock.json` as `chore(release): prepare <version>`, push, and open a pull request with that title whose body names the changes released. When CI passes, squash-merge it.
2. In a worktree detached at the new `origin/main`, run `npm ci`, `npm test` and `npm pack`.
3. Publish outside the sandbox, in the background, under a pseudo-terminal: `script -qfec "npm publish openspec-loop-<version>.tgz --auth-type=web" <log> < /dev/null`. Without a terminal, npm masks the authentication URL and fails with `EOTP`. Read `https://www.npmjs.com/auth/cli/<id>` from the log and give it to the user to approve; never ask the user to run the publish. The log ends with `+ openspec-loop@<version>`.
4. Run `git tag v<version>` and `git push origin v<version>`.
5. Install into the prefix that provides `loop` on PATH, which may differ from `npm config get prefix`: `npm install -g --prefix <prefix> openspec-loop@<version>`, where `<prefix>` is the directory above `lib/node_modules` in `readlink -f "$(command -v loop)"`. The registry can take a minute to serve a new version.
6. Verify that `loop status <any name>` refuses a missing run and that the packaged skills are under `<prefix>/lib/node_modules/openspec-loop/skills/`. Then remove the release worktrees.
