## ADDED Requirements

### Requirement: Proposal decision questions

For each decision question asked while `loop-propose` follows native proposing, the skill SHALL explain the relevant context and what the answer changes, compare the options' practical tradeoffs, and identify its recommended option with a reason in self-contained user-facing prose before any compact question picker.

#### Scenario: Choosing failure behavior during proposing
- **WHEN** native proposing reached through `loop-propose` asks whether a proposed operation should stop on a failed item or continue with the remaining items
- **THEN** before presenting any picker it explains the operation and why this choice matters, compares stopping early with completing partial work, and names the recommended behavior with a reason tied to the user's request and project context
