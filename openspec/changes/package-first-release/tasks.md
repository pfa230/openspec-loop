## 1. Package

- [ ] 1.1 Apply design.md decision 1 to `package.json` and `package-lock.json`, and add `LICENSE`. Verify that `npm test` passes, and that `npm pack --dry-run` after it lists exactly `LICENSE`, `README.md`, `package.json`, `skills/openspec-loop/SKILL.md` and the files under `dist/src`, with no `dist/test` file and version `0.2.0`

## 2. Documentation

- [ ] 2.1 Rewrite the README as design.md decision 3 describes, with the skill copy command of decision 2 and the release procedure of decision 5 with the version as a placeholder. Verify that the README has no relative link and no issue reference, and that it covers installation, project setup, roles, the three delivery modes, the usage report, recovery, supervision and releasing

## 3. Clean-project exercise

- [ ] 3.1 Run design.md decision 4 with a tarball packed from the branch's tip after 2.1. Verify that:
  - `command -v loop` and each adapter resolve into the global install from the tarball, not into this repository;
  - setup changed only `openspec/loop.yaml`, `.gitignore`, `.claude/skills/openspec-loop/` and `.agents/skills/openspec-loop/`, and `.git/hooks` holds only Git's samples;
  - the Claude Code session loaded the copied skill, relayed each progress line as it arrived and showed the report unchanged;
  - the run completed in `local` delivery with the change archived on `loop/<change>` and `main` unchanged.

  Fix every README step that failed or misled, then repeat the exercise with a fresh tarball until it runs from the README alone. Post the comment on #10 that decision 4 describes.
