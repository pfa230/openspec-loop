# Design

## Context

See proposal.md for motivation and scope. `src/setup.ts` discovers every directory under the executing package's `skills/` and copies it into `.agents/skills/` and `.claude/skills/`. It already checks both tools' paths before writing and refreshes package-owned copies. `test/setup.test.ts` verifies installation, refresh, preservation of native skills, obstruction refusal, linked-worktree scope and idempotence.

The two bundled sources and their checked-in installed copies currently use `openspec-loop` and `openspec-scope`. Native OpenSpec separately owns `openspec-propose` and `/opsx:propose`; editing those files would lose custom instructions during regeneration.

## Goals / Non-Goals

Use the existing package and skill installer to distribute one consistent namespace and the proposing wrapper. Keep native artifact creation authoritative and retain the existing supervision and scoping behavior except for routing scoping proposals through the new wrapper.

No shell subcommands, native workflow copies, compatibility aliases, configuration options or repository-specific summary rule are needed.

## Decisions

### Names and invocation

| Existing skill | New skill | Responsibility |
| --- | --- | --- |
| `openspec-loop` | `loop-run` | Supervise runs, including step, stop, status and resume |
| `openspec-scope` | `loop-scope` | Attend issue-scoping sessions |
| None | `loop-propose` | Wrap native proposing and summarize the design and changes |

Rename the source directories and their frontmatter names. Codex invokes these as `$loop-run`, `$loop-scope` and `$loop-propose`; Claude Code invokes them as `/loop-run`, `/loop-scope` and `/loop-propose`. Claude's skill slash commands use the same installed skill files, so setup needs no separate command generator.

### Delegate proposing, then add the summary

Keep `skills/loop-propose/SKILL.md` short. It tells the agent to load and follow the project's installed native proposing skill or command appropriate to its harness, passing the user's request and keeping the same working directory and selected store. Native OpenSpec owns root selection, schema selection, artifact dependencies, clarification and the planning boundary. If native proposing is unavailable, report the missing prerequisite rather than substitute a copied planner.

Native planning returns to the wrapper for presentation. The wrapper reads the completed artifacts and gives a concise account of what changes and how the proposed design works before the native artifact inventory and readiness handoff, then stops without implementing or starting a run. When invoked by `loop-scope`, it returns to that existing attended review/commit workflow instead; the summary does not require a new user turn to continue scoping. Change `loop-scope`'s drafting instruction to use this wrapper while retaining its working-directory and commit rules.

### Migrate only the two known retired directories

The generic source-directory enumeration already installs the new trio. Extend setup's existing path preflight to the two retired package-owned names in both tool locations, using its current refusal behavior for files or symlinks. After all new copies install successfully, remove those retired directories. No manifest, alias or prefix-wide deletion is needed. A rerun uses the existing refresh behavior to finish a partial installation.

Adapt the existing setup tests to the new names. Extend the upgrade fixture to contain both retired skills and verify their removal and the three installed replacements while retaining its native/custom-skill preservation assertions. Keep obstruction coverage for both active destinations and the retired paths setup now removes. Tests should exercise filesystem effects, not match the wrapper's prose.

## Risks / Trade-offs

- The renamed invocations break old shortcuts. Document the new names and the upgrade-plus-`loop setup` migration; retain no aliases that leave the namespace ambiguous.
- The summary is an agent instruction rather than CLI enforcement. Reusing the installed native workflow avoids a second planning implementation to keep current.

## Migration Plan

Update README setup, scoping and running-a-change instructions to the new names and explain that existing projects upgrade the package, rerun `loop setup` and commit the resulting skill files. Refresh this repository's installed copies by building and running its own setup command from this worktree. Inspect the diff to confirm native OpenSpec skills and commands are unchanged.
