## 1. The skill shows the report unchanged

- [x] 1.1 In `skills/openspec-loop/SKILL.md`, change the first sentence of the Rules bullet that starts "When the command exits" to: "When the command exits, show the user the report unchanged, in a code block." Keep the rest of that bullet. Verify with `rg -n "report unchanged, in a code block" skills/openspec-loop/SKILL.md`

## 2. Final checks

- [x] 2.1 Run `openspec validate show-report-unchanged --strict` and `npm test`, and verify both pass
