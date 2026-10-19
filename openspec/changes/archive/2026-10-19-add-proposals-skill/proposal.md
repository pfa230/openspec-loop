# Proposal

## Why

After batch proposing with `openspec-scope`, there is no bundled skill to show the proposed backlog with source issues and an order of attack. Native `openspec list` identifies changes, but does not provide the grouped issue-oriented overview that `pfa-dev:issues` provides for open issues.

## What Changes

- Add a read-only `openspec-proposals` agent skill for Claude Code and Codex, invoked like `openspec-scope`.
- List every active OpenSpec change in the selected root, including drafts and proposals without source issues, with one row per change showing its name, creation date, source issue when recorded, and a short title or summary.
- Group bugs first and remaining proposals by area, using source issue labels and repository conventions; explain inferred classifications and recommend an order grounded in the proposals.
- Document invocation after scoping and installation through the existing `loop setup` command.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-workflow`: Add a proposal-listing skill to the attended planning workflow.

## Impact

- Add `skills/openspec-proposals/SKILL.md`; refresh its project copies in `.agents/skills/` and `.claude/skills/` through `loop setup`.
- Update README usage and existing setup test expectations that enumerate bundled skill names.
- Reuse native OpenSpec discovery, source-issue links already written by `openspec-scope`, and existing package/setup discovery. No new terminal command, runtime code, dependency, configuration or persistent index is needed.
- Scope is the invoking checkout's resolved OpenSpec root, or an explicitly selected store. Automatic discovery across worktrees, new grouping modes, proposal editing and run enrollment are outside this change.
