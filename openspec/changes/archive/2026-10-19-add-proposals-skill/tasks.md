# Tasks

## 1. Proposal listing skill

- [x] 1.1 Add `skills/openspec-proposals/SKILL.md` implementing the discovery, source-issue enrichment, grouped rows and recommendation workflow in the design. Document Codex/Claude Code invocation, selected-root scope and usage inside a scoping session or after proposals land in the README. Verify the instructions against a disposable OpenSpec root containing linked bug and area proposals, an unlinked proposal and a draft without `proposal.md`: every active change appears once, issue links and dates remain traceable, inferred classifications are marked and the order explains its reasons. Also inspect the empty-root result. This is an attended walkthrough of the instructions; do not build a parser or automated agent-evaluation harness.
- [x] 1.2 Refresh the project's `.agents/skills/openspec-proposals/` and `.claude/skills/openspec-proposals/` copies through the existing `loop setup`. Update existing setup test expectations that enumerate bundled names, including destination output and replacement coverage, to include `openspec-proposals`. Verify the existing setup tests pass and compare both installed copies to the bundled skill; no setup implementation or packaging change is needed.

## 2. Integration verification

- [x] 2.1 Run `npm test` and `openspec validate add-proposals-skill --strict --no-interactive`. Review the final diff against the proposal and cut unnecessary content; verify runtime source, package configuration, run state and source issues are unchanged.
