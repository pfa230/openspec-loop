# Tasks

## 1. Review criteria

- [x] 1.1 In `src/prompts.ts`, add a third criterion to `reviewPrompt` and `implementationReviewPrompt`: does the plan (or patch) follow the rules the repository's instructions for agents, such as `AGENTS.md` or `CLAUDE.md`, set for what a change contains, where rules for how an agent works or reports are not criteria. Replace each prompt's "Judge two things:" with "Judge these criteria:". In `findingRules`, change "one of the two criteria" to "one of the criteria" and "passes both criteria" to "passes every criterion". Leave `DATA` unchanged. Verify with a test in `test/implementation.test.ts` that runs a change and asserts both the proposal-review and implementation-review prompt transcripts state the criterion and no longer say "two things", and with `npm test` passing.
- [x] 1.2 In `README.md`, add the repository-rules criterion to the descriptions of the proposal review and the implementation review. Verify each description matches the spec delta.
