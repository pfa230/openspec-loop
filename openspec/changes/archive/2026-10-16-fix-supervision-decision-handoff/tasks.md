# Tasks

## 1. Make decision stops actionable

- [x] 1.1 Update `skills/openspec-loop/SKILL.md` with the numbered verbatim questions, plain-language choices and tradeoffs, grounded recommendations, concise reply example and consent reuse from the Supervision skill delta; permit targeted planning-artifact reads and align the existing decision-stop and present-and-wait instructions. Verify by walking through all four added scenarios with a two-question example, including insufficient evidence and complete versus missing recovery authorization.
- [x] 1.2 Refresh `.agents/skills/openspec-loop/SKILL.md` and `.claude/skills/openspec-loop/SKILL.md` from the bundled skill only; verify both are byte-identical to the bundle with `cmp` and that unrelated skills are unchanged in the diff.
- [x] 1.3 Update the README supervision description to explain the decision handoff and reuse of existing authorization; verify its wording matches the skill and spec delta without implying automatic decisions or continuation.

## 2. Verify the complete change

- [x] 2.1 Run `openspec validate fix-supervision-decision-handoff --strict`, `git diff --check` and `npm test`; verify validation and the suite pass, including existing setup distribution coverage, and review the final diff for the skill-and-documentation scope.
