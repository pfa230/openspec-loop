# Agent instructions

openspec-loop runs a committed OpenSpec change unattended to a delivered result. These rules apply to every agent working in this repository.

- **The contract is the source of truth.** `openspec/specs/loop-workflow/spec.md` defines what the loop does. Change behavior through an OpenSpec change that modifies that spec, not by editing code alone.
- **Minimal by design.** Every mechanism, option and check must serve a concrete delivery need. Do not add speculative configuration, plugin points, extra layers, silent fallbacks, or gates for work a person does by hand. When two designs both work, use the one with fewer moving parts.
- **Cut before presenting.** Before anyone sees a plan, spec or patch, test each part against the contract as the change amends it, or against the user's explicit request where the contract is silent, such as docs or tooling. Remove whatever neither requires.
- **`npm test` is the check.** It builds the package and runs the tests. Run it before claiming work is done.
- **Edit in a worktree.** Several sessions share the main checkout, and a dirty main checkout blocks delivery. Make every edit in a worktree under `.worktrees/` on its own branch, never in the main checkout and never with `main` checked out in the extra worktree.
