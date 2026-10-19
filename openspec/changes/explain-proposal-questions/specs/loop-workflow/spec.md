## ADDED Requirements

### Requirement: Proposal decision questions

When asking a decision question during attended proposing, including native proposing invoked by scoping, the agent SHALL explain the relevant context and what the answer changes, compare the options' practical tradeoffs, and identify its recommended option with a reason in self-contained user-facing prose before any compact question picker.

#### Scenario: Choosing failure behavior during proposing
- **WHEN** the agent asks whether a proposed operation should stop on a failed item or continue with the remaining items
- **THEN** before presenting any picker it explains the operation and why this choice matters, compares stopping early with completing partial work, and names the recommended behavior with a reason tied to the user's request and project context
