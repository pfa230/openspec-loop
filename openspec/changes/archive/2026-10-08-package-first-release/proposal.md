## Why

The loop's contract is implemented and #9 validated it end to end, but nobody can install it: `package.json` is `private`, at version `0.0.0`, and the package it packs holds only the README and `package.json` unless `dist` was built first, and `files` leaves out the supervision skill the contract says the loop ships. The README still says the loop is under construction and never says how to install the loop or the skill. This is build step 10 (#10).

## What Changes

- **A publishable package.** `openspec-loop` 0.2.0 on the public npm registry, licensed MIT, holding the built runtime, the four adapters and the supervision skill. pfa authorized public npm publication for this release, which #10 left to an explicit decision. Version 0.1.0 cannot be used: the legacy package published it and npm never reuses a version.
- **Setup documented end to end.** The README covers installing the package, setting up an existing OpenSpec project, and installing the supervision skill. It already covers roles, the three delivery modes, the usage report and recovery, and needs only to drop its references to the build issues.
- **The skill goes into each project that uses the loop.** A person copies it from the installed package into the project's `.claude/skills/` and `.agents/skills/` and commits it beside `openspec/loop.yaml`, as OpenSpec commits its own skills. After an upgrade they copy it again. No `loop` command installs it.
- **The packed artifact runs in a clean project.** Before publishing, the tarball is installed in a disposable OpenSpec project by following the README alone, and one supervised run there goes from a committed proposal to a delivered result.
- **A release procedure.** The README's Development section gets the steps that produced this release, including the build and tests before packing, so the next one repeats them.

Not in this change:

- A `loop` command that installs or refreshes the skill.
- A CI publish workflow, a GitHub release object, or a changelog.
- Making the repository public. The package is public; the source stays private.
- Any change to the loop's behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The supervision skill requirement already says the loop ships the skill; this change makes the package hold it. Packaging and documentation change no requirement, so the change sets `skip_specs: true`.

## Impact

- `package.json`: version, license and `files`; `private` removed.
- New `LICENSE` file; `README.md` rewritten in its opening, prerequisites and setup, with a new supervision and release section.
- The npm registry gains `openspec-loop@0.2.0`, and the repository gains the tag `v0.2.0`. Both happen after the change merges, as design.md describes.
- No source, test or spec changes.
