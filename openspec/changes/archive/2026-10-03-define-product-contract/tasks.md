## 1. Verify the contract against issue #1

- [x] 1.1 Map every Scope bullet of issue #1 to a `loop-workflow` requirement or a design non-goal; list each gap or divergence for pfa to decide, without changing the spec on the issue's authority
- [x] 1.2 Confirm the spec covers the full user workflow and its ownership boundary, and carries no legacy compatibility obligation
- [x] 1.3 Search the spec for legacy concepts (participant or provenance records, digest computation, invariant numbers, exhaustive archive replay, repository-wide enforcement, git hooks) and remove any that crept in
- [x] 1.4 For each requirement, name the delivery need it serves, and cut any requirement that serves none
- [x] 1.5 Read the spec end to end for consistency: no two requirements prescribe different transitions for the same state, each failure and recovery path has a defined next step, and each scenario asserts the behavior of its requirement

## 2. Check the contract against the build sequence

- [x] 2.1 Map each build issue #2 to #10 to the requirements it implements, so later changes modify `loop-workflow` instead of restating it, and list any issue scope the contract contradicts for pfa to decide
- [x] 2.2 Run `openspec validate define-product-contract --strict` and confirm it passes
