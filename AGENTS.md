# Agent instructions

openspec-loop runs a committed OpenSpec change unattended to a delivered result. These rules apply to every agent working in this repository.

- **The contract is the source of truth.** `openspec/specs/loop-workflow/spec.md` defines what the loop does. Change behavior through an OpenSpec change that modifies that spec, not by editing code alone.
- **Minimal by design.** A change contains only what a concrete delivery need requires. This holds for each part of the plan on its own:
  - Each sentence and scenario a spec delta adds or rewrites states behavior that the existing contract does not already imply. A delta line that restates an existing clause, or a scenario for a case the delta's own condition already excludes, breaks this rule.
  - Each mechanism, option, check, state field, record, test and task serves a clause of the existing contract, a delta line that meets the point above, or, where the contract is silent, a request the proposal records, such as docs or tooling. None duplicates what the repository already has.
  - Each item is the smallest version that serves its clause or request. A larger version needs a failure of the smaller one, shown by a run, a test or the code as it stands. A test, recording or check that guards only against a risk no run has shown breaks this rule.
  - It adds no speculative configuration, plugin points, extra layers, silent fallbacks, or gates for work a person does by hand.
- **Cut before presenting.** After the last artifact or edit and before any summary, run a cut pass against "Minimal by design", even when a skill's own steps end earlier. List each spec sentence and scenario the change adds or rewrites, then each mechanism, option, check, state field, record, test and task, each on its own line with what it serves and the failure its smaller version causes. Remove what fails the rule. The presentation includes the cut list: what the draft contained and the pass removed, and why each kept item stayed.
- **Deliver through the loop.** A change is implemented by running its committed proposal with `loop run <change>`, as the README's "Running a change" describes, not by applying it by hand. A proposal ends with its committed artifacts: start the loop, or apply the change by hand, only when the user asks for that.
- **`npm test` is the check.** It builds the package and runs the tests. Run it before claiming work is done.
- **Edit in a worktree.** Several sessions share the main checkout, and a dirty main checkout blocks delivery. Make every edit in a worktree under `.worktrees/` on its own branch, never in the main checkout and never with `main` checked out in the extra worktree.
- **Clean up after merging.** Once a pull request merges, remove its worktree and delete its branch locally and on `origin`. Git does not count a squash-merged branch as merged, so delete it with `git branch -D` once the pull request shows as merged.

## Releasing

Release exactly this way. A request to release authorizes every step, including merging the release pull request and publishing.

1. In a worktree on a new branch `release-<version>` from `origin/main`, run `npm version <version> --no-git-tag-version`, commit `package.json` and `package-lock.json` as `chore(release): prepare <version>`, push, and open a pull request with that title whose body names the changes released. When CI passes, squash-merge it.
2. In a worktree detached at the new `origin/main`, run `npm ci`, `npm test` and `npm pack`.
3. Publish outside the sandbox, in the background, under a pseudo-terminal: `script -qfec "npm publish openspec-loop-<version>.tgz --auth-type=web" <log> < /dev/null`. Without a terminal, npm masks the authentication URL and fails with `EOTP`. Read `https://www.npmjs.com/auth/cli/<id>` from the log and give it to the user to approve; never ask the user to run the publish. The log ends with `+ openspec-loop@<version>`.
4. Run `git tag v<version>` and `git push origin v<version>`.
5. Install into the prefix that provides `loop` on PATH, which may differ from `npm config get prefix`: `npm install -g --prefix <prefix> openspec-loop@<version>`, where `<prefix>` is the directory above `lib/node_modules` in `readlink -f "$(command -v loop)"`. The registry can take a minute to serve a new version.
6. Verify that `loop status <any name>` refuses a missing run and that the packaged skills are under `<prefix>/lib/node_modules/openspec-loop/skills/`. Then remove the release worktrees.
