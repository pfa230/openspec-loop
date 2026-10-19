# Spec Delta

## ADDED Requirements

### Requirement: Proposal listing skill

The loop SHALL ship a read-only `openspec-proposals` skill for Claude Code and Codex. It SHALL list every active change in the invoking checkout's resolved OpenSpec root or explicitly selected store, showing its name, date, summary and recorded source issue. It SHALL group bugs first and remaining proposals by repository area, using source issue metadata where available and marking inferred classifications. It SHALL recommend an order with reasons based on proposal dependencies, correctness and scope.

#### Scenario: Overview after batch scoping
- **WHEN** the selected root contains several proposals created through `openspec-scope`
- **THEN** the skill shows one row per change under counted groups, bugs first and other proposals by area, with change names, dates, summaries and their source issues
- **AND** it recommends which proposals to take first and explains the order from their plans

#### Scenario: Drafts and proposals without source issues
- **WHEN** the active changes include a draft without a proposal file or a proposal without a source issue
- **THEN** each remains in the listing by change name, missing information is identified, and any classification inferred from available artifacts is marked
